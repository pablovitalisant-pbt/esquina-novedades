/**
 * FASE B — Slice "Informe de Inversión en Mercadería".
 * Tests que intentan romper la única fuente de verdad del cálculo:
 * `calcularInversion` en lib/inversion-mercaderia.ts.
 *
 * Riesgos forzados:
 *  - productos con costo IS NULL (legacy pre-023) se EXCLUYEN de los totales
 *    y se cuentan aparte — NUNCA asumir costo 0.
 *  - venta potencial usa prcventa; producto legacy sin costo también tiene
 *    prcventa NULL → excluido de ambos lados.
 *  - precisión monetaria a 2 decimales.
 *  - ganancia proyectada puede ser negativa (no se fuerza a 0).
 *
 * El módulo lib/inversion-mercaderia.ts NO existe aún → estos tests están en
 * rojo hasta Fase C. Estilo: mismo patrón de función pura que calcularPrecio.
 */

import { calcularInversion, ProductoInversion } from '@/lib/inversion-mercaderia';

function p(codigo: string, saldo: number, costo: number | null, prcventa: number | null, detalle: string | null = null): ProductoInversion {
  return { codigo, detalle, saldo, costo, prcventa };
}

describe('calcularInversion — productos todos con costo', () => {
  test('1 — totales y ganancia correctos', () => {
    const { resumen } = calcularInversion([
      p('A-1', 10, 100, 150), // costoTotal 1000, venta 1500
      p('A-2', 5, 200, 240),  // costoTotal 1000, venta 1200
    ]);
    expect(resumen.costoTotal).toBe(2000);
    expect(resumen.ventaPotencialTotal).toBe(2700);
    expect(resumen.gananciaProyectada).toBe(700);
    expect(resumen.productosSinCosto).toBe(0);
  });

  test('2 — detalle por producto expone costoTotal, ventaPotencial y ganancia', () => {
    const { detalle } = calcularInversion([p('A-1', 10, 100, 150)]);
    expect(detalle[0]).toMatchObject({
      codigo: 'A-1', saldo: 10, costo: 100, prcventa: 150,
      costoTotal: 1000, ventaPotencial: 1500, ganancia: 500,
    });
  });
});

describe('calcularInversion — productos legacy con costo NULL', () => {
  test('3 — costo NULL se EXCLUYE de costoTotal (no se cuenta como 0)', () => {
    const { resumen } = calcularInversion([
      p('LEGACY', 40, null, null), // legacy: costo y prcventa NULL
      p('A-1', 10, 100, 150),      // costoTotal 1000, venta 1500
    ]);
    expect(resumen.costoTotal).toBe(1000);            // 40 * nada, NO 40*0
    expect(resumen.ventaPotencialTotal).toBe(1500);   // legacy no aporta
    expect(resumen.productosSinCosto).toBe(1);
  });

  test('4 — producto sin costo NO aparece con costo 0 en el detalle', () => {
    const { detalle } = calcularInversion([p('LEGACY', 40, null, null)]);
    // Se lista aparte como "sin costo registrado", sin inventar valores.
    expect(detalle[0].costoTotal).toBe(0);
    expect(detalle[0].ventaPotencial).toBe(0);
    // Y el costo real sigue null (no 0).
    expect(detalle[0].costo).toBeNull();
  });

  test('5 — solo legacy → costoTotal 0 y todos contados como sin costo', () => {
    const { resumen } = calcularInversion([p('L1', 3, null, null), p('L2', 7, null, null)]);
    expect(resumen.costoTotal).toBe(0);
    expect(resumen.ventaPotencialTotal).toBe(0);
    expect(resumen.productosSinCosto).toBe(2);
  });
});

describe('calcularInversion — precisión y bordes', () => {
  test('6 — redondea a 2 decimales (saldo * costo con decimales)', () => {
    const { resumen } = calcularInversion([p('A-1', 3, 12.345, 18.987)]);
    // 3 * 12.345 = 37.035 → 37.04 (redondeo bancario estándar JS Math.round)
    expect(resumen.costoTotal).toBe(37.04);
    expect(resumen.ventaPotencialTotal).toBe(56.96); // 3 * 18.987 = 56.961 → 56.96
  });

  test('7 — ganancia proyectada NEGATIVA no se fuerza a 0', () => {
    const { resumen } = calcularInversion([p('A-1', 10, 200, 150)]);
    expect(resumen.gananciaProyectada).toBe(-500);
  });

  test('8 — sin productos → totales 0', () => {
    const { resumen, detalle } = calcularInversion([]);
    expect(resumen).toEqual({ costoTotal: 0, ventaPotencialTotal: 0, gananciaProyectada: 0, productosSinCosto: 0 });
    expect(detalle).toEqual([]);
  });

  test('9 — saldo negativo no rompe el cálculo (producto con deuda de stock)', () => {
    const { resumen } = calcularInversion([p('A-1', -5, 100, 150)]);
    expect(resumen.costoTotal).toBe(-500);
    expect(resumen.gananciaProyectada).toBe(-250);
  });
});
