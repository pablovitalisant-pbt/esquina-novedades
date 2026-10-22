/**
 * Cálculo de inversión en mercadería — única fuente de verdad.
 * Función pura (sin Next.js/DB) testeable como calcularPrecio.
 *
 * Reglas (contrato Fase A):
 *  - costo_total = SUM(saldo * costo) sobre productos con costo IS NOT NULL
 *  - venta_potencial_total = SUM(saldo * prcventa)
 *  - ganancia_proyectada = venta_potencial_total - costo_total
 *  - Productos con costo NULL (legacy pre-migración 023) se EXCLUYEN de los
 *    totales y se listan aparte como "sin costo registrado". NUNCA se asume
 *    costo 0 (un legacy con saldo>0 no aporta inventario inventado).
 */

export type ProductoInversion = {
  codigo: string;
  detalle: string | null;
  saldo: number;
  costo: number | null;
  prcventa: number | null;
  /** Foto actual del producto (se resuelve contra productos, no se congela en snapshot). */
  imagen_url?: string | null;
};

export type ResumenInversion = {
  costoTotal: number;
  ventaPotencialTotal: number;
  gananciaProyectada: number;
  productosSinCosto: number;
};

export type DetalleInversion = ProductoInversion & {
  costoTotal: number;
  ventaPotencial: number;
  ganancia: number;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Formatea un monto en USD (moneda única y fija de Bazar Naty — no hay columna
 * moneda en productos; decisión cerrada por Pablo). Sufijo/prefix USD, 2
 * decimales, separador de miles en-US.
 */
export function formatUsd(n: number): string {
  return `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Filtra el detalle por saldo > 0. Default ON: solo productos con stock. */
export function filtrarConStock(detalle: DetalleInversion[], soloStock: boolean): DetalleInversion[] {
  return soloStock ? detalle.filter((d) => d.saldo > 0) : detalle;
}

export type TopMetrica = 'costoTotal' | 'ventaPotencial' | 'ganancia';
export const TOP_METRICAS: { key: TopMetrica; label: string }[] = [
  { key: 'ganancia', label: 'Ganancia proyectada' },
  { key: 'costoTotal', label: 'Capital inmovilizado' },
  { key: 'ventaPotencial', label: 'Valorización del stock' },
];

/**
 * Top N productos por métrica de dinero. Respeta el filtro de stock (hereda el
 * mismo universo que tabla/gráfico): con soloStock=true un producto sin stock
 * queda fuera; con false entra al universo pero con dinero 0 nunca desplaza
 * a uno con valor. Desempate por código para orden estable.
 */
export function topProductos(
  detalle: DetalleInversion[],
  metrica: TopMetrica,
  n = 10,
  soloStock = true
): DetalleInversion[] {
  const universo = filtrarConStock(detalle, soloStock);
  return [...universo]
    .sort((a, b) => (b[metrica] - a[metrica]) || a.codigo.localeCompare(b.codigo))
    .slice(0, n);
}

/**
 * Fecha "hoy" en hora de Bolivia (UTC-4, sin DST). El servidor corre en UTC:
 * a las 23:55 Bolivia son las 03:55 UTC del día siguiente, así que se resta
 * 4h y se toma la fecha UTC resultante para que el snapshot y el GET queden
 * en el día correcto de Bazar Naty.
 */
export function fechaBoliviaHoy(): string {
  return new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
}

export function calcularInversion(productos: ProductoInversion[]): {
  resumen: ResumenInversion;
  detalle: DetalleInversion[];
} {
  let costoTotal = 0;
  let ventaPotencialTotal = 0;
  let productosSinCosto = 0;
  const detalle: DetalleInversion[] = [];

  for (const p of productos) {
    const sinCosto = p.costo === null || p.costo === undefined;
    if (sinCosto) productosSinCosto++;

    // `?? 0`: producto sin costo/prcventa no aporta (nunca se asume costo inventado).
    const costoLinea = (p.costo ?? 0) * p.saldo;
    // Legacy sin costo también tiene prcventa NULL → no aporta venta potencial.
    const ventaLinea = (p.prcventa ?? 0) * p.saldo;

    costoTotal += costoLinea;
    ventaPotencialTotal += ventaLinea;

    detalle.push({
      ...p,
      costoTotal: round2(costoLinea),
      ventaPotencial: round2(ventaLinea),
      ganancia: round2(ventaLinea - costoLinea),
    });
  }

  return {
    resumen: {
      costoTotal: round2(costoTotal),
      ventaPotencialTotal: round2(ventaPotencialTotal),
      gananciaProyectada: round2(ventaPotencialTotal - costoTotal),
      productosSinCosto,
    },
    detalle,
  };
}
