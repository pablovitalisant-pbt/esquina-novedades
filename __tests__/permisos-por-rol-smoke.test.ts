/**
 * Fase B — Permisos por rol (admin / vendedor / bodeguero).
 *
 * Política: admin = todo. vendedor = todo excepto Caja Mayor, Config de Caja y
 * creación de usuarios. bodeguero = solo herramientas de bodega.
 * "Marcar como pagada"/"Reembolsar" quedan abiertas a vendedor (decisión tomada).
 *
 * Smoke estático sobre los guards:
 *  - 11 rutas API de Caja Mayor → admin-only (`rol !== "admin"`, sin vendedor)
 *  - caja-mayor/page.tsx → redirect si no admin
 *  - precios/clientes/catalogo-admin pages → redirect si bodeguero
 *  - clientes/catalogos/productos APIs → 403 si bodeguero
 *  - TopNav/BottomNav → Caja Mayor solo admin; Categorías visible a vendedor
 */

import fs from 'fs';
import path from 'path';
import { RUTAS_POR_ROL } from '@/lib/rutas-por-rol';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

// Las 11 rutas de Caja Mayor que pasan a admin-only (incluye saldos-iniciales GET)
const CAJA_ROUTES = [
  'app/api/caja/movimientos/route.ts',
  'app/api/caja/movimientos/[id]/route.ts',
  'app/api/caja/movimientos/[id]/notas/route.ts',
  'app/api/caja/cierres/route.ts',
  'app/api/caja/resumen/[kcodcli2]/route.ts',
  'app/api/caja/resumen-cuentas/route.ts',
  'app/api/caja/notas/[kcodcli2]/route.ts',
  'app/api/caja/nota-busqueda/route.ts',
  'app/api/caja/clientes/route.ts',
  'app/api/caja/export/route.ts',
  'app/api/caja/saldos-iniciales/route.ts',
];

describe('permisos por rol — Caja Mayor admin-only', () => {
  test.each(CAJA_ROUTES)('%s: guard admin-only, sin vendedor', (file) => {
    const content = read(file);
    // POST de movimientos tiene 2 guards; al menos uno debe ser admin-only.
    // Clave: no debe existir el guard compuesto admin && vendedor.
    expect(content).not.toMatch(/rol !== "admin" && rol !== "vendedor"/);
    // Debe existir un guard de admin (no solo sesión)
    expect(content).toMatch(/rol !== "admin"/);
  });
});

describe('permisos por rol — página Caja Mayor', () => {
  test('caja-mayor/page.tsx: redirect si no admin', () => {
    const content = read('app/(app)/caja-mayor/page.tsx');
    expect(content).toMatch(/rol !== ["']admin["']/);
    expect(content).toMatch(/redirect/);
  });
});

describe('permisos por rol — rutas-por-rol.ts (BUG-033)', () => {
  test('vendedor NO incluye caja-mayor (regresión: política declarada == vigente)', () => {
    expect(RUTAS_POR_ROL.vendedor).not.toContain('/caja-mayor');
  });

  test('admin SÍ incluye caja-mayor', () => {
    expect(RUTAS_POR_ROL.admin).toContain('/caja-mayor');
  });
});

describe('permisos por rol — páginas bloqueadas a bodeguero', () => {
  test.each([
    'app/(app)/precios/page.tsx',
    'app/(app)/clientes/page.tsx',
    'app/(app)/catalogo/admin/page.tsx',
  ])('%s: redirect si bodeguero', (file) => {
    const content = read(file);
    expect(content).toMatch(/bodeguero/);
    expect(content).toMatch(/redirect/);
  });
});

describe('permisos por rol — APIs bloqueadas a bodeguero (403)', () => {
  test.each([
    'app/api/clientes/route.ts',
    'app/api/catalogos/route.ts',
    'app/api/catalogos/[id]/route.ts',
    'app/api/productos/route.ts',
  ])('%s: 403 si bodeguero', (file) => {
    const content = read(file);
    expect(content).toMatch(/bodeguero/);
    expect(content).toMatch(/403/);
  });
});

describe('permisos por rol — Nav', () => {
  test.each(['components/TopNav.tsx', 'components/BottomNav.tsx'])(
    '%s: Caja Mayor solo admin y Categorías visible a vendedor',
    (file) => {
      const content = read(file);
      // Link Caja Mayor dentro de un bloque admin-only (no admin+vendedor)
      const cajaIdx = content.indexOf('Caja Mayor');
      const bloquePrevio = content.slice(Math.max(0, cajaIdx - 200), cajaIdx);
      expect(bloquePrevio).not.toMatch(/rol === 'vendedor'/);
      // Categorías accesible a admin O vendedor (no solo admin). Anclamos en el
      // href del link (no en el texto/comentario). TopNav usa `rol === 'vendedor'`,
      // BottomNav usa `isVendedor`.
      const hrefIdx = content.indexOf('/admin/categorias');
      expect(hrefIdx).toBeGreaterThan(-1);
      const bloqueCat = content.slice(Math.max(0, hrefIdx - 200), hrefIdx);
      expect(bloqueCat).toMatch(/rol === 'vendedor'|isVendedor/);
    }
  );
});
