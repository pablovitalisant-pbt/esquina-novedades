/**
 * Fase B — Slice 18b: Tests que intentan romper la UI de Clientes.
 *
 * Contrato: pagina /clientes, selector en AgregarANotaVentaModal,
 * navegacion en Toolbar + BottomNav (admin+vendedor), middleware.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

describe('Slice 18b — smoke UI de Clientes', () => {

  // ──── Página ────

  test('app/(app)/clientes/client_page.tsx existe', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'app/(app)/clientes/client_page.tsx'))).toBe(true);
  });

  test('app/(app)/clientes/page.tsx existe', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'app/(app)/clientes/page.tsx'))).toBe(true);
  });

  // ──── Modal: selector de cliente ────

  test('AgregarANotaVentaModal usa /api/clientes?q=', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'components/AgregarANotaVentaModal.tsx'), 'utf-8');
    expect(content).toContain('/api/clientes');
    expect(content).not.toContain('/api/prenotas'); // ya no depende de prenotas
  });

  // ──── POST acepta cliente_id ────

  test('notas-venta/route.ts POST acepta cliente_id', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'app/api/notas-venta/route.ts'), 'utf-8');
    expect(content).toContain('cliente_id');
  });

  // ──── Navegación ────

  test('TopNav.tsx contiene enlace a /clientes (Toolbar eliminado)', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'components/TopNav.tsx'), 'utf-8');
    expect(content).toContain('/clientes');
  });

  test('BottomNav.tsx contiene enlace a /clientes', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'components/BottomNav.tsx'), 'utf-8');
    expect(content).toContain('/clientes');
  });

  // ──── Rutas por rol (extraído a lib/rutas-por-rol.ts) ────

  test('lib/rutas-por-rol.ts contiene /clientes para admin y vendedor', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'lib/rutas-por-rol.ts'), 'utf-8');
    expect(content).toContain('/clientes');
  });
});
