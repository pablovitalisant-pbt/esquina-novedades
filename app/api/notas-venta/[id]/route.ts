import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sql } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { formatCLP } from '@/lib/utils';

import type { RouteContext } from '@/types';

function getUsuarioId(session: any) {
  return Number((session?.user as any)?.id);
}

async function validarSesion() {
  const session = await getServerSession(authOptions);
  const rol = (session?.user as any)?.rol;

  if (!session) {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }

  if (rol === 'bodeguero') {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
  }

  return { session, usuarioId: getUsuarioId(session) };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await validarSesion();
  if (auth.error) return auth.error;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'ID de nota inválido' }, { status: 400 });
  }
  const prenotas = await sql`
    SELECT p.*, c.nombre AS cliente_nombre
    FROM public.prenotas p
    LEFT JOIN public.clientes c ON c.id = p.cliente_id
    WHERE p.id = ${id}
  `;
  const prenota = (prenotas as any)[0];

  if (!prenota) {
    return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  }

  const items = await sql`
    SELECT * FROM public.prenota_items WHERE prenota_id = ${id} ORDER BY created_at ASC
  `;

  // Calcular total, total_pagado y saldo_pendiente (para UI de pago)
  const total = (items as any[]).reduce(
    (sum: number, i: any) => sum + Number(i.subtotal ?? 0),
    0
  );
  // Tipo derivado (5f): sin items -> null; solo cajas -> mayor; solo unidades -> menor.
  const tipo = (items as any[]).length === 0
    ? null
    : (items as any[]).every((i: any) => i.modalidad === 'caja')
      ? 'mayor'
      : (items as any[]).every((i: any) => i.modalidad !== 'caja')
        ? 'menor'
        : 'mixta';
  const pagadoRows = await sql`
    SELECT COALESCE(SUM(CASE WHEN cm.tipo = 'reembolso' THEN -cmn.monto_aplicado ELSE cmn.monto_aplicado END), 0) AS total
    FROM caja_movimiento_notas cmn
    JOIN caja_movimientos cm ON cm.id = cmn.movimiento_id
    WHERE cmn.prenota_id = ${id}
  `;
  const totalPagado = parseFloat((pagadoRows as any)[0].total);
  // Slice 3a — saldo a favor aplicado (débitos) a esta nota. Resta del saldo
  // igual que total_pagado. Hoy 0 (los débitos se generan en 3b); se deja ya
  // escrito para no volver a tocar este archivo en 3b.
  const sfRows = await sql`
    SELECT COALESCE(SUM(monto), 0) AS total
    FROM public.clientes_saldo_favor_movimientos
    WHERE aplicado_prenota_id = ${id} AND tipo = 'debito'
  `;
  const saldoFavorAplicado = parseFloat((sfRows as any)[0].total);

  // Slice 3b — saldo a favor disponible del cliente (créditos - débitos).
  // 0 si la nota no tiene cliente asignado. El frontend lo usa para decidir
  // si mostrar el botón "Aplicar saldo a favor".
  let clienteSaldoFavor = 0;
  if (prenota.cliente_id != null) {
    const sfDisponible = await sql`
      SELECT COALESCE(SUM(CASE WHEN tipo='credito' THEN monto ELSE -monto END), 0) AS disponible
      FROM public.clientes_saldo_favor_movimientos
      WHERE cliente_id = ${prenota.cliente_id}
    `;
    clienteSaldoFavor = parseFloat((sfDisponible as any)[0].disponible);
  }

  return NextResponse.json({
    ...prenota,
    items,
    tipo,
    total,
    total_pagado: totalPagado,
    saldo_favor_aplicado: saldoFavorAplicado,
    saldo_pendiente: total - totalPagado - saldoFavorAplicado,
    cliente_saldo_favor: clienteSaldoFavor,
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await validarSesion();
  if (auth.error) return auth.error;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'ID de nota inválido' }, { status: 400 });
  }
  const body = await request.json();
  const current = await sql`
    SELECT titulo_base, cliente_id FROM public.prenotas WHERE id = ${id}
  `;
  const row = (current as any)[0];
  const tituloBase = row?.titulo_base;

  // ─── Validar cliente_id si viene en el body ───
  if (body?.cliente_id !== undefined && body.cliente_id !== null) {
    const clientRows = await sql`
      SELECT id FROM public.clientes WHERE id = ${body.cliente_id}
    `;
    if ((clientRows as any).length === 0) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 400 });
    }
  }

  // ─── cliente_id → actualizar nombre_cliente desde tabla clientes ───
  let nombre_cliente: string | null | undefined = undefined;
  if (body?.cliente_id !== undefined) {
    if (body.cliente_id === null) {
      nombre_cliente = null;
    } else {
      const clientRows = await sql`
        SELECT nombre FROM public.clientes WHERE id = ${body.cliente_id}
      `;
      nombre_cliente = (clientRows as any)[0]?.nombre ?? null;
    }
  }

  // ─── Actualizar titulo si cambió el nombre_cliente ───
  const nuevoNombre = nombre_cliente !== undefined ? nombre_cliente : undefined;
  const nuevoTitulo = nuevoNombre !== undefined
    ? (nuevoNombre ? `${tituloBase} — ${nuevoNombre}` : tituloBase)
    : undefined;

  const rows = await sql`
    UPDATE public.prenotas
    SET
      titulo         = CASE WHEN ${nuevoTitulo !== undefined} THEN ${nuevoTitulo ?? null} ELSE titulo END,
      cliente_id     = CASE WHEN ${body?.cliente_id !== undefined} THEN ${body?.cliente_id === null ? null : body.cliente_id} ELSE cliente_id END,
      nombre_cliente = CASE WHEN ${nombre_cliente !== undefined} THEN ${nombre_cliente ?? null} ELSE nombre_cliente END,
      updated_at     = now()
    WHERE id = ${id}
    RETURNING *
  `;

  return NextResponse.json((rows as any)[0] ?? null);
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await validarSesion();
  if (auth.error) return auth.error;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'ID de nota inválido' }, { status: 400 });
  }
  const [sumRow] = await sql`
    SELECT COALESCE(SUM(CASE WHEN cm.tipo = 'reembolso' THEN -cmn.monto_aplicado ELSE cmn.monto_aplicado END), 0) AS total
    FROM caja_movimiento_notas cmn
    JOIN caja_movimientos cm ON cm.id = cmn.movimiento_id
    WHERE cmn.prenota_id = ${id}
  `;
  const totalPagado = parseFloat((sumRow as any).total);

  if (totalPagado > 0) {
    return NextResponse.json({
      error: 'PAGO_REGISTRADO',
      mensaje: `Esta nota de venta tiene un pago registrado de ${formatCLP(totalPagado)}`,
      monto_pagado: totalPagado,
      prenota_id: id,
    }, { status: 409 });
  }

  // Anulacion + restauracion de stock en UNA transaccion atomica con bloqueo
  // de fila (punto 2): FOR UPDATE sobre prenotas serializa con DELETE item y
  // reembolso concurrentes — el stock se restaura una sola vez. El stock se
  // lee desde GROUP BY subquery bajo el lock, no afuera de la transaccion.
  const results = await sql.transaction([
    sql`SELECT id FROM public.prenotas WHERE id = ${id} FOR UPDATE`,
    sql`UPDATE public.prenotas SET estado = 'anulada'
        WHERE id = ${id} AND estado = 'activa'
        RETURNING id`,
    sql`UPDATE public.productos p SET saldo = p.saldo + g.total_unidades
        FROM (SELECT codigo, empresa_id, SUM(unidades)::int AS total_unidades
              FROM public.prenota_items WHERE prenota_id = ${id} GROUP BY codigo, empresa_id) g
        WHERE p.codigo = g.codigo AND p.empresa_id = g.empresa_id`,
    sql`UPDATE public.ubicaciones_bodega u SET saldo = u.saldo + g.total_unidades, updated_at = NOW()
        FROM (SELECT codigo, empresa_id, SUM(unidades)::int AS total_unidades
              FROM public.prenota_items WHERE prenota_id = ${id} GROUP BY codigo, empresa_id) g
        WHERE u.codigo = g.codigo AND u.empresa_id = g.empresa_id`,
  ]);

  if ((results[1] as any).length === 0) {
    return NextResponse.json({ error: 'No encontrada o ya anulada' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
