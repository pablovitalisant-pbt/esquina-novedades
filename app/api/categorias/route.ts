import { sql } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await sql`
      SELECT c.id, c.nombre, c.created_at,
             COUNT(p.id)::int as total_productos
      FROM categorias c
      LEFT JOIN productos p ON p.categoria = c.nombre AND p.activo = true
      GROUP BY c.id, c.nombre, c.created_at
      ORDER BY c.nombre ASC
    `;
    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const role = user?.rol;

    if (role !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const body = await request.json();
    const { nombre } = body;
    // UUID opcional; sin id → gen_random_uuid().
    const id = body?.id ?? null;

    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO categorias (id, nombre)
      VALUES (COALESCE(${id ?? null}, gen_random_uuid()), ${nombre.trim()})
      RETURNING id, nombre, created_at
    `;

    return NextResponse.json(rows[0], { status: 201 });
  } catch (error: any) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
