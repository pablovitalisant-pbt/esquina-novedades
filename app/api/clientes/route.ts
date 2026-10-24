import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { CODIGO_DESPACHO } from '@/lib/pedidos/convertir';
import { NextResponse } from 'next/server';
import type { UserSession } from '@/types';

// Slice 3c — saldo_favor viene como string de numeric (Neon); se convierte a
// number para que el render no dependa de un tipo ambiguo.
const conSaldoFavor = (r: Record<string, unknown>) => ({ ...r, saldo_favor: Number(r.saldo_favor) || 0 });

// Slice 6a — etiqueta derivada de las notas activas del cliente.
const ETIQUETAS = ['mayorista', 'minorista', 'ambos', 'sin'];

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if ((session.user as UserSession).rol === 'bodeguero') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const etiqueta = searchParams.get('etiqueta');
  if (etiqueta !== null && !ETIQUETAS.includes(etiqueta)) {
    return NextResponse.json({ error: 'Etiqueta inválida' }, { status: 400 });
  }
  // `sin` = etiqueta NULL; el resto filtra por igualdad. El filtro va antes del LIMIT.
  const pattern = q ? `%${q}%` : null;

  try {
    const rows = await sql`
      SELECT c.*, COALESCE((
        SELECT SUM(CASE WHEN tipo='credito' THEN monto ELSE -monto END)
        FROM public.clientes_saldo_favor_movimientos
        WHERE cliente_id = c.id
      ), 0) AS saldo_favor
      FROM (
        SELECT id, nombre, telefono, direccion, notas, created_at::text,
          (SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                       WHEN BOOL_AND(pi.modalidad='caja') THEN 'mayorista'
                       WHEN BOOL_AND(pi.modalidad='unidad') THEN 'minorista'
                       ELSE 'ambos' END
           FROM public.prenotas p
           JOIN public.prenota_items pi ON pi.prenota_id = p.id
           WHERE p.cliente_id = clientes.id AND p.estado = 'activa'
             AND pi.codigo <> ${CODIGO_DESPACHO}) AS etiqueta
        FROM public.clientes
        WHERE (${q}::text IS NULL OR nombre ILIKE ${pattern})
      ) c
      WHERE (${etiqueta}::text IS NULL
        OR (${etiqueta} = 'sin' AND c.etiqueta IS NULL)
        OR (${etiqueta} <> 'sin' AND c.etiqueta = ${etiqueta}))
      ORDER BY c.nombre ASC
      LIMIT 50
    `;
    return NextResponse.json({ data: rows.map(conSaldoFavor) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if ((session.user as UserSession).rol === 'bodeguero') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { nombre, telefono, direccion, notas } = body;
    // UUID opcional; sin id → gen_random_uuid().
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
    } catch (err) {
      // Slice unicidad: violación del índice único por teléfono normalizado.
      const code = (err as { code?: string } | null)?.code;
      if (code === '23505' && telefono?.trim()) {
        const normalizado = telefono.trim().replace(/\D/g, '');
        const existente = await sql`
          SELECT nombre FROM public.clientes
          WHERE regexp_replace(telefono, '[^0-9]', '', 'g') = ${normalizado}
          LIMIT 1
        `;
        const nombreExistente = existente[0]?.nombre ?? 'Otro cliente';
        return NextResponse.json(
          { error: `Ya existe un cliente con este teléfono: ${nombreExistente}` },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
