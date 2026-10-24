import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sql } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { CODIGO_DESPACHO } from '@/lib/pedidos/convertir';

function getUsuarioId(session: any) {
  return Number((session?.user as any)?.id);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const rol = (session?.user as any)?.rol;

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

  const data = rows.map((r: any) => ({
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
  const rol = (session?.user as any)?.rol;

  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (rol === 'bodeguero') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  let body: any = {};
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
  const usuarioNombre = (session.user as any).nombre;
  const count = await sql`
    SELECT COUNT(*) FROM public.prenotas WHERE usuario_id = ${usuarioId}
  `;
  const n = Number((count as any)[0].count) + 1;
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

  return NextResponse.json((rows as any)[0]);
}
