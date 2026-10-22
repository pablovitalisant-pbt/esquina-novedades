import { formatArsEquivalente } from '@/lib/utils';

describe('formatArsEquivalente — intenta romper el slice de cifras ARS', () => {
  // RIESGO 1: dolar_dia = 0 (no configurado / apagado) → NO debe mostrar "≈ AR$ 0"
  it('retorna null si dolarDia es 0 (evita mostrar "≈ AR$ 0")', () => {
    expect(formatArsEquivalente(100, 0)).toBeNull();
  });

  // RIESGO 1b: dolar_dia negativo no es un escenario real pero no debe romper
  it('retorna null si dolarDia es negativo', () => {
    expect(formatArsEquivalente(100, -10)).toBeNull();
  });

  // RIESGO 2: dolar_dia llega como NaN (parseFloat de string inválido) → no romper
  it('retorna null si dolarDia es NaN', () => {
    expect(formatArsEquivalente(100, NaN)).toBeNull();
  });

  // RIESGO 2b: dolar_dia undefined → no romper
  it('retorna null si dolarDia es undefined', () => {
    expect(formatArsEquivalente(100, undefined as any)).toBeNull();
  });

  // RIESGO 2c: usd NaN → no romper
  it('retorna null si usd es NaN', () => {
    expect(formatArsEquivalente(NaN, 1200)).toBeNull();
  });

  // Caso feliz: dolar_dia válido → formato correcto con 2 decimales y símbolo AR$
  it('formatea el equivalente en ARS con 2 decimales cuando dolarDia > 0', () => {
    const r = formatArsEquivalente(100, 1200);
    expect(r).not.toBeNull();
    expect(r).toMatch(/AR\$/);
    expect(r).toMatch(/120,000\.00/); // 100 * 1200 = 120000
  });

  // Caso feliz: multiplicación correcta
  it('multiplica usd * dolarDia correctamente', () => {
    const r = formatArsEquivalente(12.5, 1200);
    expect(r).toContain('15,000.00'); // 12.5 * 1200 = 15000
  });
});
