/**
 * Fase B — Slice 20: Tests que intentan romper la limpieza de Precios.
 *
 * Contrato: EMPRESA_SLUG eliminado, empresasMap eliminado,
 * empresaSlug hardcodeado a 'sanjh' en ProductCard.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PRECIOS_CLIENT = 'app/(app)/precios/client_page.tsx';
const PRECIOS_PAGE = 'app/(app)/precios/page.tsx';

describe('Slice 20 — smoke limpieza Precios', () => {

  test('client_page.tsx NO contiene EMPRESA_SLUG', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, PRECIOS_CLIENT), 'utf-8');
    expect(content).not.toContain('EMPRESA_SLUG');
  });

  test('client_page.tsx NO contiene empresasMap', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, PRECIOS_CLIENT), 'utf-8');
    expect(content).not.toContain('empresasMap');
  });

  test('client_page.tsx hardcodea empresaSlug como bazar-naty (single-tenant, migracion 018)', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, PRECIOS_CLIENT), 'utf-8');
    expect(content).toContain("bazar-naty");
  });

  test('page.tsx NO contiene query de empresas', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, PRECIOS_PAGE), 'utf-8');
    expect(content).not.toContain('empresas');
  });

  test('jest.setup.ts contiene IntersectionObserver polyfill', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'jest.setup.ts'), 'utf-8');
    expect(content).toContain('IntersectionObserver');
  });

  // Guard: ProductCard sigue recibiendo empresaSlug como prop
  test('ProductCard sigue aceptando empresaSlug en su interfaz', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'components/ProductCard.tsx'), 'utf-8');
    expect(content).toContain('empresaSlug');
  });
});
