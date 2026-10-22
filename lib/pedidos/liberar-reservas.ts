/**
 * Slice 8a — liberación de reservas vencidas (36 h) en UNA sola sentencia.
 *
 * El UPDATE condicionado de `pedidos` es la exclusión: dos llamadas
 * concurrentes compiten por la misma fila, la segunda reevalúa el WHERE tras
 * el commit de la primera y ya no la ve. Por eso la devolución de stock no
 * puede duplicarse y no hay ventana entre marcar y devolver.
 */
import { sql } from '@/lib/db';

export interface LiberacionReservas {
  liberados: number;
  unidades: number;
}

export async function liberarReservasVencidas(): Promise<LiberacionReservas> {
  const rows = await sql`
    WITH vencidos AS (
      UPDATE pedidos SET estado = 'expirado', stock_reservado = false
      WHERE estado = 'pendiente_pago' AND stock_reservado = true AND expira_en < NOW()
      RETURNING id
    ), devoluciones AS (
      -- Se devuelve lo que se reservó (pi.unidades), nunca recalculado con el
      -- tamaño actual de la caja: si cambió entre reserva y expiración,
      -- recalcular devolvería una cantidad distinta a la descontada.
      -- Filas con unidades NULL (líneas sin reserva) no devuelven nada.
      SELECT pi.producto_id,
             SUM(pi.unidades)::int AS unidades
      FROM pedido_items pi
      JOIN vencidos v ON v.id = pi.pedido_id
      WHERE pi.unidades IS NOT NULL
      GROUP BY pi.producto_id
    ), prod AS (
      UPDATE productos p SET saldo = COALESCE(p.saldo, 0) + d.unidades, updated_at = NOW()
      FROM devoluciones d WHERE p.id = d.producto_id
      RETURNING p.id
    ), ub AS (
      UPDATE ubicaciones_bodega u SET saldo = COALESCE(u.saldo, 0) + d.unidades, updated_at = NOW()
      FROM devoluciones d JOIN productos p ON p.id = d.producto_id
      WHERE u.codigo = p.codigo AND u.empresa_id = p.empresa_id
      RETURNING u.id
    )
    SELECT (SELECT count(*)::int FROM vencidos) AS liberados,
           (SELECT COALESCE(sum(unidades), 0)::int FROM devoluciones) AS unidades
  `;

  const row = (rows as unknown as LiberacionReservas[])[0];
  return { liberados: row?.liberados ?? 0, unidades: row?.unidades ?? 0 };
}
