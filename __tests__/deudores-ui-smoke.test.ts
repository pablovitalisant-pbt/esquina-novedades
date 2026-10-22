/**
 * Fase B — Smoke UI de la página "Deudores" (/deudores).
 * Verifica los puntos de integración del slice: página, endpoint, nav,
 * rutas-por-rol (admin+vendedor), guard bodeguero, feature flag.
 * Estilo fs, replicando slice18b-clientes-ui-smoke.test.ts.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

describe('Slice Deudores — smoke UI', () => {

  // ──── Página y endpoint ────
  test('app/(app)/deudores/client_page.tsx existe', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'app/(app)/deudores/client_page.tsx'))).toBe(true);
  });

  test('app/(app)/deudores/page.tsx existe', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'app/(app)/deudores/page.tsx'))).toBe(true);
  });

  test('app/api/deudores/route.ts existe', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'app/api/deudores/route.ts'))).toBe(true);
  });

  // ──── Guard bodeguero (patrón notas-venta) ────
  test('deudores/page.tsx redirige a bodeguero (mismo guard que notas-venta)', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'app/(app)/deudores/page.tsx'), 'utf-8');
    expect(content).toContain("rol === 'bodeguero'");
    expect(content).toContain("redirect('/dashboard')");
  });

  // ──── Navegación bajo "Ventas" ────
  test('TopNav.tsx contiene enlace a /deudores', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'components/TopNav.tsx'), 'utf-8');
    expect(content).toContain('/deudores');
  });

  test('BottomNav.tsx contiene enlace a /deudores', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'components/BottomNav.tsx'), 'utf-8');
    expect(content).toContain('/deudores');
  });

  // ──── Rutas por rol (admin + vendedor, no bodeguero) ────
  test('lib/rutas-por-rol.ts contiene /deudores para admin y vendedor', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'lib/rutas-por-rol.ts'), 'utf-8');
    expect(content).toContain('/deudores');
  });

  test('lib/rutas-por-rol.ts NO incluye /deudores para bodeguero', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'lib/rutas-por-rol.ts'), 'utf-8');
    const bodegueroBlock = content.split('bodeguero:')[1] ?? '';
    expect(bodegueroBlock).not.toContain('/deudores');
  });
});
