/**
 * Fase B — Slice 4: Test de contrato para formatMonto con ARS
 *
 * formatMonto vive en docs/specs/caja-mayor.spec.ts y es ejecutado por Jest.
 * Contrato post-rename: acepta "ARS" como moneda, mismo formato que CLP
 * (sin decimales, separador de miles, prefijo $).
 */

import { formatMonto } from '../docs/specs/caja-mayor.spec';

describe('formatMonto — contrato ARS (mismo formato que CLP)', () => {

  // ──── ARS: sin decimales (locale es-CL: punto para miles) ────

  test('ARS: 1000 → "1.000"', () => {
    expect(formatMonto(1000, 'ARS')).toBe('1.000');
  });

  test('ARS: 0 → "0"', () => {
    expect(formatMonto(0, 'ARS')).toBe('0');
  });

  test('ARS: 1250000 → "1.250.000"', () => {
    expect(formatMonto(1250000, 'ARS')).toBe('1.250.000');
  });

  test('ARS: valor negativo → "-1" (toLocaleString lo maneja)', () => {
    expect(formatMonto(-1, 'ARS')).toBe('-1');
  });

  // ──── USD: locale es-CL, entero → sin decimales ────

  test('USD: 1000 es entero → "1.000" (sin decimales)', () => {
    // 1000 % 1 === 0 → minimumFractionDigits: 0
    expect(formatMonto(1000, 'USD')).toBe('1.000');
  });

  test('USD: 1000.5 no es entero → "1.000,5" (coma decimal)', () => {
    // 1000.5 % 1 !== 0 → minimumFractionDigits: 2 → "1.000,50"
    expect(formatMonto(1000.5, 'USD')).toBe('1.000,50');
  });

  // ──── CLP rechazado ────
  // No hay test runtime de rechazo de CLP porque formatMonto no valida
  // la moneda en runtime (caería en el branch USD silenciosamente).
  // El rechazo es a nivel de tipos: "CLP" no compila con el tipo
  // "USD" | "ARS". Verificado por tsc --noEmit (0 errores nuevos).
});
