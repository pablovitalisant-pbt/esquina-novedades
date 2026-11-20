import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { usuarioSesion, usuarioIdSesion } from '@/lib/session';
import { mensajeError } from '@/lib/errores';
import flags from '@/config/feature-flags.json';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ESTADOS_ENTREGABLES = ['convertido', 'pagado'];

type EntregaPresencia = {
  id: string;
  estado: string;
  entregado_en: string | null;
  entregado_por_nombre: string | null;
};

function respuesta(p: EntregaPresencia) {
  return NextResponse.json({
    data: {
      id: p.id,
      entregado_en: p.entregado_en ?? null,
      entregado_por_nombre: p.entregado_por_nombre ?? null,
    },
  }, { status: 200 });
}

async function lecturaActual(id: string): Promise<EntregaPresencia | undefined> {
  const [p] = await sql`
    SELECT id, estado, entregado_en::text, entregado_por_nombre
    FROM public.pedidos
    WHERE id = ${id}::uuid
  `;
  return p as EntregaPresencia | undefined;
}

// Entrega de pedidos: S1. Idempotente por el WHERE condicionado: si el pedido
// ya fue entregado, el UPDATE devuelve 0 filas y se relee el estado actual sin
// cambiar fecha ni usuario. Solo admin y vendedor marcan; solo admin desmarca.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (flags['pedidos-entrega'] !== true) {
    return NextResponse.json({ error: 'Entrega no disponible' }, { status: 404 });
  }
  const usuario = usuarioSesion(session);
  const rol = usuario.rol;
  if (rol !== 'admin' && rol !== 'vendedor') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const entregado = body?.entregado;
    if (typeof entregado !== 'boolean') {
      return NextResponse.json({ error: 'entregado debe ser boolean' }, { status: 400 });
    }
    if (!UUID.test(id)) {
      return NextResponse.json({ error: 'UUID inválido' }, { status: 400 });
    }
    if (!entregado && rol !== 'admin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    // usuarios.id es entero: un id de sesión no numérico no debe romper el FK;
    // se guarda NULL y el nombre queda igual.
    const usuarioId = usuarioIdSesion(session);
    const nombre = usuario.nombre || 'usuario';

    const rows = entregado
      ? await sql`
          UPDATE public.pedidos
          SET entregado_en = NOW(), entregado_por_id = ${usuarioId}, entregado_por_nombre = ${nombre}
          WHERE id = ${id}::uuid
            AND estado IN ('convertido', 'pagado')
            AND entregado_en IS NULL
          RETURNING id, entregado_en::text, entregado_por_nombre
        `
      : await sql`
          UPDATE public.pedidos
          SET entregado_en = NULL, entregado_por_id = NULL, entregado_por_nombre = NULL
          WHERE id = ${id}::uuid
            AND estado IN ('convertido', 'pagado')
            AND entregado_en IS NOT NULL
          RETURNING id, entregado_en::text, entregado_por_nombre
        `;

    if (rows.length > 0) return respuesta(rows[0] as EntregaPresencia);

    const actual = await lecturaActual(id);
    if (!actual) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }
    if (!ESTADOS_ENTREGABLES.includes(actual.estado)) {
      return NextResponse.json({ error: 'El pedido no está convertido ni pagado' }, { status: 409 });
    }
    // Idempotencia: ya estaba entregado (o ya estaba sin entregar).
    return respuesta(actual);
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}
