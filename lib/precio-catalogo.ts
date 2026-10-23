/**
 * Precio de catálogo mostrado al público: costo + margen, redondeado hacia
 * arriba al peso (CLP entero, sin decimales). Única fuente de esta fórmula: la
 * página del catálogo y el cálculo server-side de pedidos la reutilizan para
 * cobrar exactamente lo que se muestra y lo que redondea Mercado Pago.
 */
export function precioCatalogoBase(costo: number, margenPct: number): number {
  return Math.ceil(costo * (1 + margenPct / 100));
}
