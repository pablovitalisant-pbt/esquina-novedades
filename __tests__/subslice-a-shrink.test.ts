/**
 * Fase B — Sub-slice A (#7): eliminar useEmpresaId, limpiar DISABLED_V2,
 * colapsar PasoProductoDeseado, quitar newDesc oculto.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('9.17 — useEmpresaId eliminado', () => {
  test('hooks/useEmpresaId.ts ya no existe', () => {
    expect(fs.existsSync(path.join(ROOT, 'hooks/useEmpresaId.ts'))).toBe(false);
  });

  test('__tests__/useEmpresaId.test.ts ya no existe', () => {
    expect(fs.existsSync(path.join(ROOT, '__tests__/useEmpresaId.test.ts'))).toBe(false);
  });

  const consumers = [
    'app/(app)/bodega/client_page.tsx',
    'app/(app)/catalogo/admin/client_page.tsx',
    'app/(app)/admin/categorias/client_page.tsx',
  ];

  test.each(consumers)('%s NO importa useEmpresaId', (file) => {
    const content = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    expect(content).not.toMatch(/useEmpresaId/);
  });
});

describe('9.19 — ProductDrawer sin DISABLED_V2', () => {
  test('ProductDrawer.tsx NO contiene DISABLED_V2', () => {
    const content = fs.readFileSync(path.join(ROOT, 'components/ProductDrawer.tsx'), 'utf-8');
    expect(content).not.toMatch(/DISABLED_V2/);
  });
});

describe('9.20 — CrearCatalogoDialog sin newDesc oculto', () => {
  test('CrearCatalogoDialog.tsx NO contiene newDesc', () => {
    const content = fs.readFileSync(path.join(ROOT, 'components/CrearCatalogoDialog.tsx'), 'utf-8');
    expect(content).not.toMatch(/newDesc/);
  });

  test('CrearCatalogoDialog.tsx NO tiene div hidden con descripcion', () => {
    const content = fs.readFileSync(path.join(ROOT, 'components/CrearCatalogoDialog.tsx'), 'utf-8');
    expect(content).not.toMatch(/hidden.*descripcion/);
  });
});
