import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import type { UserSession } from '@/types';
import { NextResponse } from 'next/server';

// :id es producto_id (no alerta.id). La tabla alertas_stock_bajo ahora es
// una lista de productos silenciados, no de alertas activas.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const rol = (session?.user as UserSession | undefined)?.rol;
  if (!session || !rol || !['admin', 'bodeguero'].includes(rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const productoId = Number((await params).id);
    const { accion } = await request.json();

    if (accion === 'ignorar') {
      await sql`
        INSERT INTO alertas_stock_bajo (producto_id)
        VALUES (${productoId})
        ON CONFLICT (producto_id) DO NOTHING
      `;
      return NextResponse.json({ ok: true });
    }

    if (accion === 'no_reponer') {
      await sql`
        UPDATE productos SET no_reponer = true WHERE id = ${productoId}
      `;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'accion inválida' }, { status: 400 });
  } catch (error) {
    console.error('PUT /api/alertas-stock/[id] error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
