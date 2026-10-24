import { sql } from '@/lib/db';
import type { UserSession } from '@/types';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as UserSession;
    const role = user?.rol;

    if (role !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { id } = await params;

    const count = await sql`
      SELECT COUNT(*)::int as total
      FROM productos
      WHERE categoria = (SELECT nombre FROM categorias WHERE id = ${id})
    `;

    await sql`
      UPDATE productos SET categoria = NULL
      WHERE categoria = (SELECT nombre FROM categorias WHERE id = ${id})
    `;

    await sql`
      DELETE FROM categorias WHERE id = ${id}
    `;

    return NextResponse.json({ ok: true, productos_desasignados: count[0].total });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
