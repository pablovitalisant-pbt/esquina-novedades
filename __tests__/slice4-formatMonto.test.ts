/**
 * formatMonto (docs/specs/caja-mayor.spec.ts): monto CLP entero, es-CL, sin moneda.
 */
import { formatMonto } from '../docs/specs/caja-mayor.spec';

describe('formatMonto — CLP entero (es-CL)', () => {
  test.each([
    [1000, '1.000'],
    [0, '0'],
    [1250000, '1.250.000'],
    [-1, '-1'],
    [1000.5, '1.001'],
  ])('%p → %p', (n, esperado) => {
    expect(formatMonto(n)).toBe(esperado);
  });
});
