import { sql } from '@/lib/db';

/**
 * Reserva de stock de una línea del pedido online (dentro de sql.transaction).
 * Descuenta `unidades` de productos.saldo (y de ubicaciones_bodega) solo si
 * alcanza el stock; si no alcanza, aborta con 22012 (division by zero) y la
 * transacción completa hace rollback.
 *
 * BUG-003: NO usar `CASE WHEN ... THEN 1 ELSE 1 / 0 END`. Postgres pliega la
 * constante `1 / 0` al planificar y la consulta falla SIEMPRE, haya stock o no.
 * El divisor tiene que depender de la fila actualizada: `1 / COUNT(*)`.
 */
export function reservarStockLinea(productoId: number, unidades: number) {
  return sql`
    WITH upd AS (
      UPDATE public.productos
      SET saldo = saldo - ${unidades}, updated_at = NOW()
      WHERE id = ${productoId} AND saldo >= ${unidades}
      RETURNING id, codigo, empresa_id
    ), ub AS (
      UPDATE public.ubicaciones_bodega u
      SET saldo = u.saldo - ${unidades}, updated_at = NOW()
      FROM upd
      WHERE u.codigo = upd.codigo AND u.empresa_id = upd.empresa_id
      RETURNING u.id
    )
    SELECT 1 / (SELECT COUNT(*) FROM upd)::int AS ok
  `;
}