/**
 * Calcula prcventa desde costo y margen_pct.
 * Invariante anti-drift: servidor es la única fuente de este cálculo.
 * Ponytail: función pura, sin dependencias de Next.js — testeable sin mockear HTTP.
 */
export function calcularPrecio(costo: number, margenPct: number): number {
  return Math.round(costo * (1 + margenPct / 100));
}
