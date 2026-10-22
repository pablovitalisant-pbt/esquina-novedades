/**
 * Fase B — Tests funcionales del invariante anti-drift.
 * Ejecutan calcularPrecio() con valores reales, no regex sobre fuente.
 * Sin dependencias de Next.js — función pura.
 */
import { calcularPrecio } from '@/lib/calcular-precio';

describe('calcularPrecio — invariante anti-drift', () => {

  test('costo 3.33, margen 30 → prcventa 4.33 (redondeo a 2 decimales)', () => {
    // 3.33 * (1 + 30/100) = 3.33 * 1.30 = 4.329
    // Math.round(4.329 * 100) / 100 = Math.round(432.9) / 100 = 433 / 100 = 4.33
    expect(calcularPrecio(3.33, 30)).toBe(4.33);
  });

  test('costo 100, margen 0 → prcventa = costo (sin ganancia)', () => {
    expect(calcularPrecio(100, 0)).toBe(100);
  });

  test('costo 50, margen 50 → prcventa 75', () => {
    expect(calcularPrecio(50, 50)).toBe(75);
  });

  test('costo 10.50, margen 15.5 → prcventa 12.13', () => {
    // 10.50 * 1.155 = 12.1275 → Math.round(1212.75)/100 = 1213/100 = 12.13
    expect(calcularPrecio(10.50, 15.5)).toBe(12.13);
  });

  test('costo 1, margen 100 → prcventa 2 (100% markup)', () => {
    expect(calcularPrecio(1, 100)).toBe(2);
  });

  test('margen con decimales: costo 20, margen 33.33 → prcventa 26.67', () => {
    // 20 * 1.3333 = 26.666 → Math.round(2666.6)/100 = 2667/100 = 26.67
    expect(calcularPrecio(20, 33.33)).toBe(26.67);
  });
});
