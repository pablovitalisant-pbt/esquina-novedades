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

const round2 = Math.round; // CLP entero (formato: formatCLP en lib/utils)

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
 * Fecha "hoy" en hora de Chile (America/Santiago, con DST). El servidor corre
 * en UTC: se formatea en esa zona para que el snapshot y el GET queden en el
 * día correcto de la tienda.
 */
export function fechaHoyChile(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
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
