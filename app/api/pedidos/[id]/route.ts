import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

function usuarioSesion(session: { user?: unknown } | null | undefined): { rol?: string } {
  return (session?.user as { rol?: string } | undefined) ?? {};
}

function mensajeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// PATCH /api/pedidos/[id] — única transición de estado: pendiente → descartado.
// Rechaza bodeguero; 409 si el pedido ya no está pendiente (convertido/descartado).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (usuarioSesion(session).rol === 'bodeguero') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const estado = body?.estado;
    if (estado !== 'descartado') {
      return NextResponse.json({ error: 'Transición no soportada' }, { status: 400 });
    }

    // Guard de estado: solo transiciona si sigue siendo descartable (UPDATE
    // condicionado devuelve 0 filas si ya cambió → 409). Si el pedido tenía
    // stock reservado, la devolución va en la MISMA sentencia: el CTE obj es
    // la exclusión, así que una segunda llamada no devuelve el stock dos veces.
    const rows = await sql`
      WITH obj AS (
        UPDATE public.pedidos
        SET estado = 'descartado', stock_reservado = false
        WHERE id = ${id} AND estado IN ('pendiente', 'pendiente_pago', 'pagado', 'revision')
        RETURNING id, estado
      ), devoluciones AS (
        -- Se devuelve lo reservado (pi.unidades), no cantcaja actual.
        SELECT pi.producto_id, SUM(pi.unidades)::int AS unidades
        FROM public.pedido_items pi
        JOIN obj o ON o.id = pi.pedido_id
        JOIN public.pedidos p ON p.id = pi.pedido_id AND p.stock_reservado = true
        WHERE pi.unidades IS NOT NULL
        GROUP BY pi.producto_id
      ), prod AS (
        UPDATE public.productos p
        SET saldo = COALESCE(p.saldo, 0) + d.unidades, updated_at = NOW()
        FROM devoluciones d WHERE p.id = d.producto_id
        RETURNING p.id
      ), ub AS (
        UPDATE public.ubicaciones_bodega u
        SET saldo = COALESCE(u.saldo, 0) + d.unidades, updated_at = NOW()
        FROM devoluciones d JOIN public.productos p ON p.id = d.producto_id
        WHERE u.codigo = p.codigo AND u.empresa_id = p.empresa_id
        RETURNING u.id
      )
      SELECT o.id, o.estado FROM obj o
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'El pedido no está pendiente' }, { status: 409 });
    }
    return NextResponse.json({ data: { id: rows[0].id, estado: rows[0].estado } }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}
