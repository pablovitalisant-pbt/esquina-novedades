/**
 * Fase B — Slice 2a: margen calculado en el servidor.
 * Función pura calcularMargen() con valores reales, no regex sobre fuente.
 */
import { calcularMargen } from '@/lib/calcular-precio';

describe('calcularMargen — margen derivado de costo y precio', () => {
  test('costo 1000, precio 1500 → 50', () => {
    expect(calcularMargen(1000, 1500)).toBe(50);
  });

  test('precio igual al costo → 0', () => {
    expect(calcularMargen(100, 100)).toBe(0);
  });

  test('costo 50, precio 75 → 50', () => {
    expect(calcularMargen(50, 75)).toBe(50);
  });

  test('redondea a 2 decimales: 20 → 26.67', () => {
    // (26.67 / 20 - 1) * 100 = 33.35
    expect(calcularMargen(20, 26.67)).toBe(33.35);
  });

  test('costo o precio no positivos → null', () => {
    expect(calcularMargen(0, 10)).toBeNull();
    expect(calcularMargen(10, 0)).toBeNull();
    expect(calcularMargen(-1, 10)).toBeNull();
  });

  test('costo o precio null → null', () => {
    expect(calcularMargen(null, 10)).toBeNull();
    expect(calcularMargen(10, null)).toBeNull();
  });
});
