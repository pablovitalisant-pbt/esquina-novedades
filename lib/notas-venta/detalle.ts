import { sql } from '@/lib/db';
import { CODIGO_DESPACHO } from '@/lib/pedidos/convertir';

export type DetalleNota = Record<string, unknown> & {
  items: unknown[];
  tipo: 'mayor' | 'menor' | 'mixta' | null;
  total: number;
  total_pagado: number;
  saldo_favor_aplicado: number;
  saldo_pendiente: number;
  cliente_saldo_favor: number;
};

type ItemNota = { subtotal?: number | string | null; codigo?: unknown; modalidad?: unknown };
type TotalRow = { total: string };
type DisponibleRow = { disponible: string };

/**
 * Lectura y cálculo del detalle de una nota de venta.
 * COPIA exacta de la lógica de GET /api/notas-venta/[id] (sin auth: la valida el caller).
 * Devuelve null si la nota no existe.
 */
export async function leerDetalleNota(id: number): Promise<DetalleNota | null> {
  const prenotas = await sql`
    SELECT p.*,
      c.nombre AS cliente_nombre,
      COALESCE(NULLIF(BTRIM(ped.direccion_entrega), ''), NULLIF(BTRIM(c.direccion), '')) AS cliente_direccion,
      COALESCE(NULLIF(BTRIM(ped.telefono_contacto), ''), NULLIF(BTRIM(c.telefono), '')) AS cliente_telefono
    FROM public.prenotas p
    LEFT JOIN public.clientes c ON c.id = p.cliente_id
    LEFT JOIN LATERAL (
      SELECT pe.direccion_entrega, pe.telefono_contacto
      FROM public.pedidos pe
      WHERE pe.prenota_id = p.id
      ORDER BY pe.created_at DESC, pe.id DESC
      LIMIT 1
    ) ped ON true
    WHERE p.id = ${id}
  `;
  const prenota = (prenotas as Record<string, unknown>[])[0];

  if (!prenota) return null;

  // Las cuatro consultas son independientes: se despachan juntas, mismo orden
  // que antes (items, pagado, aplicado, disponible).
  const clienteId = prenota.cliente_id;
  const [items, pagadoRows, sfRows, sfDisponible] = await Promise.all([
    sql`
      SELECT * FROM public.prenota_items WHERE prenota_id = ${id} ORDER BY created_at ASC
    `,
    sql`
      SELECT COALESCE(SUM(CASE WHEN cm.tipo = 'reembolso' THEN -cmn.monto_aplicado ELSE cmn.monto_aplicado END), 0) AS total
      FROM caja_movimiento_notas cmn
      JOIN caja_movimientos cm ON cm.id = cmn.movimiento_id
      WHERE cmn.prenota_id = ${id}
    `,
    // Saldo a favor aplicado (débitos) a esta nota. Resta del saldo igual que total_pagado.
    sql`
      SELECT COALESCE(SUM(monto), 0) AS total
      FROM public.clientes_saldo_favor_movimientos
      WHERE aplicado_prenota_id = ${id} AND tipo = 'debito'
    `,
    // Saldo a favor disponible del cliente (créditos - débitos). 0 sin cliente.
    clienteId != null
      ? sql`
          SELECT COALESCE(SUM(CASE WHEN tipo='credito' THEN monto ELSE -monto END), 0) AS disponible
          FROM public.clientes_saldo_favor_movimientos
          WHERE cliente_id = ${clienteId}
        `
      : Promise.resolve([] as DisponibleRow[]),
  ]);

  // Calcular total, total_pagado y saldo_pendiente (para UI de pago)
  const total = (items as ItemNota[]).reduce(
    (sum, i) => sum + Number(i.subtotal ?? 0),
    0
  );
  // Tipo derivado (5f): sin items -> null; solo mayor -> mayor; solo detalle -> menor.
  // La línea Despacho no es un producto y no cuenta para el tipo.
  const itemsTipo = (items as ItemNota[]).filter((i) => i.codigo !== CODIGO_DESPACHO);
  const tipo = itemsTipo.length === 0
    ? null
    : itemsTipo.every((i) => i.modalidad === 'mayor')
      ? 'mayor'
      : itemsTipo.every((i) => i.modalidad === 'detalle')
        ? 'menor'
        : 'mixta';
  const totalPagado = parseFloat((pagadoRows as TotalRow[])[0].total);
  const saldoFavorAplicado = parseFloat((sfRows as TotalRow[])[0].total);
  const clienteSaldoFavor = parseFloat((sfDisponible as DisponibleRow[])[0]?.disponible ?? '0');

  return {
    ...prenota,
    items,
    tipo,
    total,
    total_pagado: totalPagado,
    saldo_favor_aplicado: saldoFavorAplicado,
    saldo_pendiente: total - totalPagado - saldoFavorAplicado,
    cliente_saldo_favor: clienteSaldoFavor,
  };
}
