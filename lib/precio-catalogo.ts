/**
 * Precio de un producto en un catálogo: el precio especial del catálogo
 * (catalogo_precio_override) si es válido; si no, el precio de venta del
 * producto (prcventa). Siempre CLP entero. Única fuente de esta regla: la
 * página pública y el cobro server-side de pedidos la reutilizan para cobrar
 * exactamente lo que se muestra y lo que redondea Mercado Pago.
 */
export function precioEnCatalogo(
  prcventa: number | string | null | undefined,
  override?: number | string | null,
): number | null {
  if (override !== null && override !== undefined) {
    const especial = Number(override);
    if (Number.isFinite(especial) && especial >= 0) return Math.round(especial);
  }
  const base = prcventa === null || prcventa === undefined ? Number.NaN : Number(prcventa);
  if (Number.isFinite(base) && base > 0) return Math.round(base);
  return null;
}
