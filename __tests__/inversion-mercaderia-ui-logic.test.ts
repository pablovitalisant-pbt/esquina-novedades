/**
 * FASE B — Mejoras UI del Informe de Inversión (contrato Dirección Técnica).
 * Lógica pura: formatUsd, filtrarConStock, topProductos (en lib/inversion-mercaderia).
 *
 * Riesgos forzados:
 *  - formato USD fijo (moneda única, no formatMonto() de caja).
 *  - toggle "solo con stock" default ON filtra saldo>0.
 *  - Top 10: default métrica ganancia; re-ranking al cambiar métrica;
 *    respeta el filtro de stock (un producto sin stock no desplaza a uno con valor).
 */

import { filtrarConStock, topProductos } from '@/lib/inversion-mercaderia';
import { formatCLP } from '@/lib/utils';
import { DetalleInversion } from '@/lib/inversion-mercaderia';

function d(codigo: string, saldo: number, costoTotal: number, ventaPotencial: number): DetalleInversion {
  return {
    codigo, detalle: null, saldo,
    costo: costoTotal / Math.max(saldo, 1), prcventa: ventaPotencial / Math.max(saldo, 1),
    costoTotal, ventaPotencial, ganancia: ventaPotencial - costoTotal,
  };
}

// A: ganancia 220 | B: sin stock, dinero 0 | C: ganancia 300 | D: ganancia 200
const DETALLE: DetalleInversion[] = [
  d('A', 40, 500, 720),      // ganancia 220
  d('B', 0, 0, 0),           // sin stock → no aporta
  d('C', 25, 300, 600),      // ganancia 300
  d('D', 10, 1000, 1200),    // ganancia 200
];

describe('formatCLP — moneda única CLP', () => {
  test('1 — entero, separador de miles con punto', () => {
    expect(formatCLP(377072.91)).toBe('$377.073');
    expect(formatCLP(0)).toBe('$0');
    expect(formatCLP(195885.19)).toBe('$195.885');
  });
});

describe('filtrarConStock — default ON', () => {
  test('2 — true filtra saldo>0; false deja todo', () => {
    const filtrado = filtrarConStock(DETALLE, true);
    expect(filtrado.map((p) => p.codigo)).toEqual(['A', 'C', 'D']); // B fuera
    const todos = filtrarConStock(DETALLE, false);
    expect(todos).toHaveLength(4);
  });
});

describe('topProductos — ranking por métrica, default ganancia', () => {
  test('3 — default ganancia: C(300) > A(220) > D(200), B sin stock queda fuera', () => {
    const top = topProductos(DETALLE, 'ganancia', 3);
    expect(top.map((p) => p.codigo)).toEqual(['C', 'A', 'D']);
  });

  test('4 — métrica costoTotal re-ordena: D(1000) > A(500) > C(300)', () => {
    const top = topProductos(DETALLE, 'costoTotal', 3);
    expect(top.map((p) => p.codigo)).toEqual(['D', 'A', 'C']);
  });

  test('5 — métrica ventaPotencial re-ordena: D(1200) > A(720) > C(600)', () => {
    const top = topProductos(DETALLE, 'ventaPotencial', 3);
    expect(top.map((p) => p.codigo)).toEqual(['D', 'A', 'C']);
  });

  test('6 — respeta filtro de stock: con soloStock=false, B (dinero 0) nunca entra al top', () => {
    const top = topProductos(DETALLE, 'ganancia', 3, false);
    expect(top.map((p) => p.codigo)).toEqual(['C', 'A', 'D']);
    expect(top.some((p) => p.codigo === 'B')).toBe(false);
  });

  test('7 — con todo dinero 0 el ranking no se rompe (B queda pero sin aportar)', () => {
    const soloB = [d('B', 0, 0, 0)];
    const top = topProductos(soloB, 'ganancia', 10, false);
    expect(top.map((p) => p.codigo)).toEqual(['B']);
  });
});
