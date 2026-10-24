import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sql } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { CODIGO_DESPACHO } from '@/lib/pedidos/convertir';
import { usuarioSesion } from '@/lib/session';
import type { Session } from 'next-auth';

function getUsuarioId(session: Session | null) {
  return Number(usuarioSesion(session).id);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const rol = usuarioSesion(session).rol;

  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (rol === 'bodeguero') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const rows = await sql`
    SELECT
      p.*,
      COALESCE((SELECT SUM(pi.subtotal) FROM public.prenota_items pi WHERE pi.prenota_id = p.id), 0) as total,
      (SELECT CASE
                WHEN COUNT(*) = 0 THEN NULL
                WHEN BOOL_AND(pi.modalidad = 'caja') THEN 'mayor'
                WHEN BOOL_AND(pi.modalidad = 'unidad') THEN 'menor'
                ELSE 'mixta'
              END
       FROM public.prenota_items pi
       WHERE pi.prenota_id = p.id AND pi.codigo <> ${CODIGO_DESPACHO}) as tipo,
      COALESCE((SELECT SUM(cmn.monto_aplicado) FROM public.caja_movimiento_notas cmn WHERE cmn.prenota_id = p.id), 0) as total_pagado,
      COALESCE((SELECT SUM(monto) FROM public.clientes_saldo_favor_movimientos
                WHERE aplicado_prenota_id = p.id AND tipo = 'debito'), 0) as saldo_favor_aplicado
    FROM public.prenotas p
    WHERE p.estado != 'anulada'
    ORDER BY p.estado ASC, p.updated_at DESC
  `;

  const data = (rows as Record<string, unknown>[]).map((r) => ({
    ...r,
    total: Number(r.total),
    total_pagado: Number(r.total_pagado),
    saldo_favor_aplicado: Number(r.saldo_favor_aplicado || 0),
    saldo_pendiente: Number(Number(r.total) - Number(r.total_pagado) - Number(r.saldo_favor_aplicado || 0)),
  }));

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const rol = usuarioSesion(session).rol;

  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (rol === 'bodeguero') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  let body: { cliente_id?: string | null } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // cliente_id es ahora un UUID (string) desde 13a
  const cliente_id = body?.cliente_id ?? null;

  const usuarioId = getUsuarioId(session);
  // Notas compartidas: numeración por creador se mantiene, pero el título incluye
  // el nombre del creador para distinguir notas del mismo # de usuarios distintos.
  const usuarioNombre = usuarioSesion(session).nombre;
  const count = await sql`
    SELECT COUNT(*) FROM public.prenotas WHERE usuario_id = ${usuarioId}
  `;
  const n = Number((count as { count: string }[])[0].count) + 1;
  const fecha = new Date().toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const titulo = `Nota de Venta #${n} de ${usuarioNombre} — ${fecha}`;
  const rows = await sql`
    INSERT INTO public.prenotas (titulo, titulo_base, usuario_id, cliente_id)
    VALUES (${titulo}, ${titulo}, ${usuarioId}, ${cliente_id})
    RETURNING *
  `;

  return NextResponse.json((rows as Record<string, unknown>[])[0]);
}
