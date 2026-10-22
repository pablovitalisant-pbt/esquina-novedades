import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';

// Slice 3c — saldo_favor viene como string de numeric (Neon); se convierte a
// number para que el render no dependa de un tipo ambiguo.
const conSaldoFavor = (r: any) => ({ ...r, saldo_favor: Number(r.saldo_favor) || 0 });

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if ((session.user as any).rol === 'bodeguero') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  try {
    if (q) {
      const pattern = `%${q}%`;
      const rows = await sql`
        SELECT id, nombre, telefono, direccion, notas, created_at::text,
          COALESCE((
            SELECT SUM(CASE WHEN tipo='credito' THEN monto ELSE -monto END)
            FROM public.clientes_saldo_favor_movimientos
            WHERE cliente_id = clientes.id
          ), 0) AS saldo_favor
        FROM public.clientes
        WHERE nombre ILIKE ${pattern}
        ORDER BY nombre ASC
        LIMIT 20
      `;
      return NextResponse.json({ data: (rows as any[]).map(conSaldoFavor) });
    }

    const rows = await sql`
      SELECT id, nombre, telefono, direccion, notas, created_at::text,
        COALESCE((
          SELECT SUM(CASE WHEN tipo='credito' THEN monto ELSE -monto END)
          FROM public.clientes_saldo_favor_movimientos
          WHERE cliente_id = clientes.id
        ), 0) AS saldo_favor
      FROM public.clientes
      ORDER BY nombre ASC
      LIMIT 50
    `;
    return NextResponse.json({ data: (rows as any[]).map(conSaldoFavor) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if ((session.user as any).rol === 'bodeguero') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { nombre, telefono, direccion, notas } = body;
    // UUID opcional — lo manda BackendConnector (Slice 13b) con el id local
    // de PowerSync, para que local = servidor sin duplicados. Flujo online
    // sin id → gen_random_uuid().
    const id = body?.id ?? null;

    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
    }

    try {
      const rows = await sql`
        INSERT INTO public.clientes (id, nombre, telefono, direccion, notas)
        VALUES (COALESCE(${id ?? null}, gen_random_uuid()), ${nombre.trim()}, ${telefono?.trim() || null}, ${direccion?.trim() || null}, ${notas?.trim() || null})
        RETURNING id, nombre, telefono, direccion, notas, created_at::text
      `;
      return NextResponse.json({ data: rows[0] }, { status: 201 });
    } catch (err: any) {
      // Slice unicidad: violación del índice único por teléfono normalizado.
      if (err?.code === '23505' && telefono?.trim()) {
        const normalizado = telefono.trim().replace(/\D/g, '');
        const existente = await sql`
          SELECT nombre FROM public.clientes
          WHERE regexp_replace(telefono, '[^0-9]', '', 'g') = ${normalizado}
          LIMIT 1
        `;
        const nombreExistente = (existente as any)[0]?.nombre ?? 'Otro cliente';
        return NextResponse.json(
          { error: `Ya existe un cliente con este teléfono: ${nombreExistente}` },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
