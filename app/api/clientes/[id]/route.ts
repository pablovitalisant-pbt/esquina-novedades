import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    // id es ahora un UUID (string), ya no un SERIAL
    const id = (await params).id;

    const rows = await sql`
      SELECT id, nombre, telefono, direccion, notas, created_at::text
      FROM public.clientes
      WHERE id = ${id}
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }
    return NextResponse.json({ data: rows[0] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    // id es ahora un UUID (string), ya no un SERIAL
    const id = (await params).id;

    const body = await request.json();
    const { nombre, telefono, direccion, notas } = body;

    try {
      const rows = await sql`
        UPDATE public.clientes
        SET
          nombre = COALESCE(${nombre?.trim() || null}, nombre),
          telefono = COALESCE(${telefono?.trim() ?? null}, telefono),
          direccion = COALESCE(${direccion?.trim() ?? null}, direccion),
          notas = COALESCE(${notas?.trim() ?? null}, notas)
        WHERE id = ${id}
        RETURNING id, nombre, telefono, direccion, notas, created_at::text
      `;
      if (rows.length === 0) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
      }
      return NextResponse.json({ data: rows[0] });
    } catch (err: any) {
      // Slice unicidad: el teléfono editado choca con OTRO cliente (no con el
      // propio, que ya cambió de número si el UPDATE falló y volvió atrás).
      if (err?.code === '23505' && telefono?.trim()) {
        const normalizado = telefono.trim().replace(/\D/g, '');
        const existente = await sql`
          SELECT nombre FROM public.clientes
          WHERE regexp_replace(telefono, '[^0-9]', '', 'g') = ${normalizado}
            AND id <> ${id}
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    // id es ahora un UUID (string), ya no un SERIAL
    const id = (await params).id;

    // Verificar existencia
    const existing = await sql`SELECT id FROM public.clientes WHERE id = ${id}`;
    if (existing.length === 0) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    // Verificar notas de venta asociadas y su estado
    const notas = await sql`SELECT id, estado FROM public.prenotas WHERE cliente_id = ${id}`;
    const notasActivas = notas.filter((n: any) => n.estado !== 'anulada');
    if (notasActivas.length > 0) {
      return NextResponse.json(
        { error: 'No se puede eliminar: el cliente tiene notas de venta asociadas' },
        { status: 409 }
      );
    }

    // Si hay notas anuladas, verificar que no tengan movimientos de caja
    if (notas.length > 0) {
      const notaIds = notas.map((n: any) => n.id);
      const cajaCheck = await sql`
        SELECT 1 FROM public.caja_movimiento_notas
        WHERE prenota_id = ANY(${notaIds})
        LIMIT 1
      `;
      if (cajaCheck.length > 0) {
        return NextResponse.json(
          { error: 'No se puede eliminar: existen movimientos de caja asociados a notas anuladas de este cliente' },
          { status: 409 }
        );
      }

      // Eliminar notas anuladas (cascada automática a prenota_items vía ON DELETE CASCADE)
      await sql`DELETE FROM public.prenotas WHERE cliente_id = ${id} AND estado = 'anulada'`;
    }

    // Eliminar cliente
    await sql`DELETE FROM public.clientes WHERE id = ${id}`;
    return NextResponse.json({ data: { id } });
  } catch (error: any) {
    // Postgres FK violation: error code 23503 o 23001 (defensivo — no debería pasar con la lógica de arriba)
    if (error.code === '23503' || error.code === '23001') {
      return NextResponse.json(
        { error: 'No se puede eliminar: el cliente tiene notas de venta asociadas' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
