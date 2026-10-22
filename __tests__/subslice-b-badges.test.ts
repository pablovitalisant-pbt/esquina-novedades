/**
 * Fase B — Sub-slice B: unificar badges SANJH/VIDA DIGITAL → Bazar Naty.
 * Tests que fuerzan la condición antes del fix (rojo).
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

// Archivos activos que DEBEN limpiarse (excluye kardex — diferido)
const FILES_TO_CLEAN = [
  'components/ProductCard.tsx',
  'components/ProductDrawer.tsx',
  'app/(app)/notas-venta/[id]/client_page.tsx',
  'app/(app)/bodega/registro-notas/client_page.tsx',
  'app/(app)/bodega/client_page.tsx',
  'app/(app)/precios/client_page.tsx',
];

describe('Sub-slice B — badges SANJH/VIDA DIGITAL eliminados', () => {

  test.each(FILES_TO_CLEAN)('%s NO contiene "SANJH" ni "VIDA DIGITAL"', (file) => {
    const content = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    expect(content).not.toMatch(/SANJH|VIDA DIGITAL/);
  });

  test.each(FILES_TO_CLEAN)('%s NO contiene empresa_id ternario (=== 1 ? SANJH : VIDA)', (file) => {
    const content = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    expect(content).not.toMatch(/empresa_id\s*===\s*1\s*\?\s*'SANJH'/);
  });

  test('bodega/client_page.tsx usa empresaSlug = bazar-naty', () => {
    const content = fs.readFileSync(path.join(ROOT, 'app/(app)/bodega/client_page.tsx'), 'utf-8');
    expect(content).toContain("EMPRESA.slug");
    expect(content).not.toContain("= 'sanjh'");
  });

  test('precios/client_page.tsx usa empresaSlug bazar-naty en ProductCard', () => {
    const content = fs.readFileSync(path.join(ROOT, 'app/(app)/precios/client_page.tsx'), 'utf-8');
    expect(content).toContain("EMPRESA.slug");
    expect(content).not.toContain("'sanjh'");
  });

  test('ProductCard.tsx NO tiene EMPRESA_SHORT', () => {
    const content = fs.readFileSync(path.join(ROOT, 'components/ProductCard.tsx'), 'utf-8');
    expect(content).not.toMatch(/EMPRESA_SHORT/);
  });

  test('ProductDrawer.tsx NO tiene EMPRESA_SHORT ni EMPRESA_SLUG', () => {
    const content = fs.readFileSync(path.join(ROOT, 'components/ProductDrawer.tsx'), 'utf-8');
    expect(content).not.toMatch(/EMPRESA_SHORT|EMPRESA_SLUG/);
  });

  test('bodega/registro-notas NO tiene selector de empresa (<option value={2}>VIDA DIGITAL)', () => {
    const content = fs.readFileSync(path.join(ROOT, 'app/(app)/bodega/registro-notas/client_page.tsx'), 'utf-8');
    expect(content).not.toMatch(/VIDA DIGITAL/);
    expect(content).not.toMatch(/value=\{2\}/);
  });
});
