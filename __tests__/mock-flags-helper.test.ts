/**
 * Fase B — A19: el helper lee el JSON real y solo pisa lo que el test fija.
 */
import flagsReales from '@/config/feature-flags.json';
import { mockFlags } from './helpers/mockFlags';

describe('mockFlags', () => {
  test('los overrides pisan al JSON real', () => {
    expect(mockFlags({ 'pos-v1': false })['pos-v1']).toBe(false);
  });

  test('los flags no mencionados vienen del JSON real', () => {
    const out = mockFlags({ 'pos-v1': false });
    expect(Object.keys(out).sort()).toEqual(Object.keys(flagsReales).sort());
    for (const [clave, valor] of Object.entries(flagsReales)) {
      if (clave !== 'pos-v1') expect(out[clave]).toBe(valor);
    }
  });

  // Lee el JSON en cada llamada y no cachea: un flag nuevo en el JSON llega
  // a las suites migradas sin tocarlas (el set de claves = JSON real).
  test('no cachea: cada llamada refleja el JSON actual', () => {
    const primera = mockFlags();
    primera['pos-v1'] = false;
    expect(mockFlags()['pos-v1']).toBe(flagsReales['pos-v1']);
  });
});
