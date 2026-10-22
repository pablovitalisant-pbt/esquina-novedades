/**
 * Fase B — Eliminar Deseados + fix Saldo Zofri en ProductCard.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('Deseados eliminado de ProductCard', () => {
  const content = fs.readFileSync(path.join(ROOT, 'components/ProductCard.tsx'), 'utf-8');

  test('NO importa AgregarADeseadosModal', () => {
    expect(content).not.toMatch(/AgregarADeseadosModal/);
  });

  test('NO tiene icono Heart (corazón de Deseados)', () => {
    expect(content).not.toMatch(/Heart/);
  });

  test('NO tiene estado deseadoOpen', () => {
    expect(content).not.toMatch(/deseadoOpen/);
  });

  test('conserva boton Agregar a Nota de Venta intacto', () => {
    expect(content).toContain('Agregar a Nota de Venta');
    expect(content).toMatch(/ClipboardList/);
    expect(content).toMatch(/AgregarANotaVentaModal/);
  });
});

describe('Deseados — archivos eliminados', () => {
  test('AgregarADeseadosModal.tsx ya no existe', () => {
    expect(fs.existsSync(path.join(ROOT, 'components/AgregarADeseadosModal.tsx'))).toBe(false);
  });

  test('PasoProductoDeseado.tsx ya no existe', () => {
    expect(fs.existsSync(path.join(ROOT, 'components/PasoProductoDeseado.tsx'))).toBe(false);
  });
});

describe('Saldo Zofri → Stock en ProductCard', () => {
  const content = fs.readFileSync(path.join(ROOT, 'components/ProductCard.tsx'), 'utf-8');

  test('NO contiene "Saldo Zofri"', () => {
    expect(content).not.toMatch(/Saldo Zofri/);
  });

  test('contiene label "Stock" como reemplazo', () => {
    expect(content).toMatch(/Stock/);
  });
});
