/**
 * lim2 — puedeVenderMayor: precio_mayor no nulo y entero > 0.
 * Regresión: con precio_mayor = 0 el modal NO debe habilitar "Por mayor".
 */
import { puedeVenderMayor } from '@/lib/precio-mayor';

describe('puedeVenderMayor', () => {
  test('precio_mayor = 0 NO se puede vender por mayor', () => {
    expect(puedeVenderMayor({ precio_mayor: 0 })).toBe(false);
  });

  test('null / undefined / ausente NO se puede', () => {
    expect(puedeVenderMayor({ precio_mayor: null })).toBe(false);
    expect(puedeVenderMayor({ precio_mayor: undefined })).toBe(false);
    expect(puedeVenderMayor({})).toBe(false);
  });

  test('entero > 0 SÍ se puede', () => {
    expect(puedeVenderMayor({ precio_mayor: 1 })).toBe(true);
    expect(puedeVenderMayor({ precio_mayor: 2500 })).toBe(true);
  });

  test('no entero o negativo NO se puede', () => {
    expect(puedeVenderMayor({ precio_mayor: 12.5 })).toBe(false);
    expect(puedeVenderMayor({ precio_mayor: -100 })).toBe(false);
  });
});
