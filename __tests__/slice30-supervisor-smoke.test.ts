/**
 * Fase B — Slice 30: Tests contra el CONTRATO OBJETIVO (post-fix supervisor).
 * DEBEN estar en ROJO ahora y en VERDE en Fase C.
 *
 * Contrato: quitar 'supervisor' de 9 archivos de produccion + types/index.ts.
 * 12 matches en total. El rol no existe en Bazar Naty (PRD seccion 2).
 *
 * Guarda de regresion: __tests__/api/categorias.test.ts (7 tests, incluye
 * admin creando categoria y vendedor rechazado). Se corre aparte en Fase D.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

const FILES = [
  'app/(app)/admin/categorias/page.tsx',
  'app/api/alertas-stock/lista/route.ts',
  'app/api/alertas-stock/route.ts',
  'app/api/alertas-stock/[id]/route.ts',
  'app/api/categorias/route.ts',
  'app/api/productos/upload/route.ts',
  'app/api/productos/[id]/route.ts',
  'components/ProductDrawer.tsx',
];

describe('Slice 30 — Fase B: remover supervisor (contra contrato objetivo)', () => {

  test.each(FILES)('%s NO contiene supervisor', (file) => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
    expect(content).not.toContain('supervisor');
  });

  test('types/index.ts NO incluye supervisor en union de roles', () => {
    const typesContent = fs.readFileSync(path.join(PROJECT_ROOT, 'types/index.ts'), 'utf-8');
    expect(typesContent).not.toMatch(/rol.*supervisor/);
  });
});
