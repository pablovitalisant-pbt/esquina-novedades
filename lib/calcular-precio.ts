/**
 * Margen de ganancia derivado de costo y precio de venta.
 * Invariante anti-drift: el servidor es la única fuente de este cálculo.
 * Redondea a 2 decimales. Devuelve null si costo o precio no son > 0.
 * Ponytail: función pura, sin dependencias de Next.js — testeable sin mockear HTTP.
 */
export function calcularMargen(costo: number | null | undefined, precio: number | null | undefined): number | null {
  if (costo == null || precio == null || costo <= 0 || precio <= 0) return null;
  return Math.round(((precio / costo) - 1) * 10000) / 100;
}
