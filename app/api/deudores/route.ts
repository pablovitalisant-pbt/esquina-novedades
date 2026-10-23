import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sql } from '@/lib/db';
import { authOptions } from '@/lib/auth';

// GET /api/deudores — deudas pendientes agrupadas por cliente.
// Reutiliza el cálculo de total/total_pagado/saldo_pendiente de GET /api/notas-venta.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const rol = (session?.user as any)?.rol;
  if (rol === 'bodeguero') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const rows = await sql`
    SELECT
      p.id,
      p.titulo,
      p.created_at,
      p.cliente_id,
      p.nombre_cliente,
      c.nombre AS cliente_nombre,
      c.telefono AS cliente_telefono,
      COALESCE((SELECT SUM(pi.subtotal) FROM public.prenota_items pi WHERE pi.prenota_id = p.id), 0) as total,
      COALESCE((SELECT SUM(cmn.monto_aplicado) FROM public.caja_movimiento_notas cmn WHERE cmn.prenota_id = p.id), 0) as total_pagado,
      COALESCE((SELECT SUM(monto) FROM public.clientes_saldo_favor_movimientos
                WHERE aplicado_prenota_id = p.id AND tipo = 'debito'), 0) as saldo_favor_aplicado
    FROM public.prenotas p
    LEFT JOIN public.clientes c ON c.id = p.cliente_id
    WHERE p.estado = 'activa'
    ORDER BY p.created_at ASC
  `;

  // Filtrar deudas (saldo > 0.005, mismo criterio que notas-venta) y agrupar.
  const map = new Map<string, any>();

  for (const r of rows as any[]) {
    const total = Number(r.total);
    const totalPagado = Number(r.total_pagado);
    const saldoFavorAplicado = Number(r.saldo_favor_aplicado || 0);
    const saldo = total - totalPagado - saldoFavorAplicado;
    if (saldo <= 0.005) continue;
    // Solo entran notas con abono parcial real (algo pagado). Una nota con
    // saldo pendiente pero $0 abonado no es "deudor": se excluye.
    const abono = totalPagado + saldoFavorAplicado;
    if (abono <= 0.005) continue;

    const key = r.cliente_id ? String(r.cliente_id) : `nota:${r.id}`;
    const nombre = r.cliente_nombre || r.nombre_cliente || 'Sin nombre';

    let grupo = map.get(key);
    if (!grupo) {
      grupo = {
        cliente_id: r.cliente_id ?? null,
        cliente_nombre: nombre,
        telefono: r.cliente_id ? (r.cliente_telefono || '') : '',
        num_notas: 0,
        deuda_total: 0,
        notas: [],
        deuda_mas_antigua: r.created_at,
      };
      map.set(key, grupo);
    }

    grupo.num_notas += 1;
    grupo.deuda_total = Number(grupo.deuda_total) + saldo;
    grupo.notas.push({ id: r.id, titulo: r.titulo });
    if (new Date(r.created_at) < new Date(grupo.deuda_mas_antigua)) {
      grupo.deuda_mas_antigua = r.created_at;
    }
  }

  const data = Array.from(map.values()).sort(
    (a, b) => new Date(a.deuda_mas_antigua).getTime() - new Date(b.deuda_mas_antigua).getTime()
  );

  return NextResponse.json({ data });
}
