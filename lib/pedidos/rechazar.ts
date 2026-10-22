import { sql } from '@/lib/db';

/**
 * Slice 9c — libera la reserva y marca el pedido `rechazado`.
 * Misma exclusión atómica que PATCH /api/pedidos/[id]: solo actúa si sigue
 * `pendiente_pago`; una segunda llamada devuelve 0 filas y NO devuelve stock.
 */
export async function rechazarPedido(pedidoId: string): Promise<boolean> {
  const rows = await sql`
    WITH obj AS (
      UPDATE public.pedidos
      SET estado = 'rechazado', stock_reservado = false, idempotency_key = NULL
      WHERE id = ${pedidoId} AND estado = 'pendiente_pago'
      RETURNING id
    ), devoluciones AS (
      -- Se devuelve lo reservado (pi.unidades); nunca se recalcula cantcaja.
      SELECT pi.producto_id, SUM(pi.unidades)::int AS unidades
      FROM public.pedido_items pi
      JOIN obj o ON o.id = pi.pedido_id
      WHERE pi.unidades IS NOT NULL
      GROUP BY pi.producto_id
    ), prod AS (
      UPDATE public.productos p
      SET saldo = COALESCE(p.saldo, 0) + d.unidades, updated_at = NOW()
      FROM devoluciones d WHERE p.id = d.producto_id
      RETURNING p.id
    ), ub AS (
      UPDATE public.ubicaciones_bodega u
      SET saldo = COALESCE(u.saldo, 0) + d.unidades, updated_at = NOW()
      FROM devoluciones d JOIN public.productos p ON p.id = d.producto_id
      WHERE u.codigo = p.codigo AND u.empresa_id = p.empresa_id
      RETURNING u.id
    )
    SELECT o.id FROM obj o
  `;
  return rows.length > 0;
}
