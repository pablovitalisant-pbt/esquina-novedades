import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

// PATCH /api/pedidos/[id] — única transición de estado: pendiente → descartado.
// Rechaza bodeguero; 409 si el pedido ya no está pendiente (convertido/descartado).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if ((session.user as any).rol === 'bodeguero') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const estado = body?.estado;
    if (estado !== 'descartado') {
      return NextResponse.json({ error: 'Transición no soportada' }, { status: 400 });
    }

    // Guard de estado: solo transiciona si está 'pendiente' (UPDATE con WHERE
    // devuelve 0 filas si ya cambió → 409).
    const rows = await sql`
      UPDATE public.pedidos
      SET estado = 'descartado'
      WHERE id = ${id} AND estado = 'pendiente'
      RETURNING id, estado
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'El pedido no está pendiente' }, { status: 409 });
    }
    return NextResponse.json({ data: { id: rows[0].id, estado: rows[0].estado } }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
