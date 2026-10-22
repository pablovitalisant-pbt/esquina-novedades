/**
 * Precio de catálogo mostrado al público: costo + margen, redondeado hacia
 * arriba a 1 decimal. Única fuente de esta fórmula: la página del catálogo y
 * el cálculo server-side de pedidos la reutilizan para no cobrar distinto.
 */
export function precioCatalogoBase(costo: number, margenPct: number): number {
  return Math.ceil(costo * (1 + margenPct / 100) * 10) / 10;
}
