/**
 * Fase B — Slice 3: Tests que intentan romper el rename /prenotas → /notas-venta
 *
 * Contrato: las rutas viejas dejan de existir, las nuevas existen.
 * Los imports desde los nuevos paths resuelven. Components, middleware
 * y navegación apuntan a /notas-venta. Tipos y variables internas
 * mantienen nombre "Prenota" (diferido a slice futuro).
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ──── Rutas viejas NO deben existir ────

const OLD_PATHS = [
  'app/(app)/prenotas',
  'app/api/prenotas',
];

const OLD_COMPONENT = 'components/AgregarAPrenotaModal.tsx';

// ──── Rutas nuevas DEBEN existir ────

const NEW_PATHS = [
  'app/(app)/notas-venta/page.tsx',
  'app/(app)/notas-venta/client_page.tsx',
  'app/(app)/notas-venta/[id]/page.tsx',
  'app/(app)/notas-venta/[id]/client_page.tsx',
  'app/api/notas-venta/route.ts',
  'app/api/notas-venta/[id]/route.ts',
  'app/api/notas-venta/[id]/items/route.ts',
  'app/api/notas-venta/[id]/items/[itemId]/route.ts',
  'components/AgregarANotaVentaModal.tsx',
];

// ──── Archivos que DEBEN apuntar a /notas-venta (no /prenotas) ────

const FILES_MUST_USE_NEW_PATH = [
  { file: 'components/TopNav.tsx', check: 'href="/notas-venta"' },
  { file: 'components/BottomNav.tsx', check: "startsWith('/notas-venta')" },
  { file: 'lib/rutas-por-rol.ts', check: "'/notas-venta'" },
];

// ──── Archivos que DEBEN importar desde nuevas rutas ────

const FILES_MUST_IMPORT_NEW = [
  { file: 'components/ProductCard.tsx', check: "AgregarANotaVentaModal" },
  { file: 'components/ProductDrawer.tsx', check: "AgregarANotaVentaModal" },
];

// ──── Archivos que NO deben contener URLs viejas ────

const FILES_MUST_NOT_HAVE_OLD_URL = [
  'components/TopNav.tsx',
  'components/BottomNav.tsx',
  'lib/rutas-por-rol.ts',
  'components/ProductCard.tsx',
  'components/ProductDrawer.tsx',
];

describe('Slice 3 — smoke de rename /prenotas → /notas-venta', () => {

  // ──── Directorios viejos eliminados ────

  test.each(OLD_PATHS)('el directorio viejo NO existe: %s', (p) => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, p))).toBe(false);
  });

  test('el componente viejo NO existe', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, OLD_COMPONENT))).toBe(false);
  });

  // ──── Directorios/archivos nuevos existen ────

  test.each(NEW_PATHS)('el archivo nuevo SÍ existe: %s', (p) => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, p))).toBe(true);
  });

  // ──── Navegación y middleware apuntan a rutas nuevas ────

  test.each(FILES_MUST_USE_NEW_PATH)(
    '$file contiene "$check"',
    ({ file, check }) => {
      const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
      expect(content).toContain(check);
    }
  );

  // ──── Imports desde nueva ubicación ────

  test.each(FILES_MUST_IMPORT_NEW)(
    '$file importa desde AgregarANotaVentaModal',
    ({ file, check }) => {
      const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
      expect(content).toContain(check);
    }
  );

  // ──── Sin URLs viejas residuales ────

  test.each(FILES_MUST_NOT_HAVE_OLD_URL)(
    '%s NO contiene "/prenotas"',
    (file) => {
      const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
      expect(content).not.toContain('/prenotas');
    }
  );

  // ──── URLs de API internas en componentes movidos usan nueva ruta ────

  test('AgregarANotaVentaModal usa /api/notas-venta internamente', () => {
    const p = path.join(PROJECT_ROOT, 'components/AgregarANotaVentaModal.tsx');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain('/api/notas-venta');
    expect(content).not.toContain('/api/prenotas');
  });

  test('notas-venta/client_page.tsx usa /api/notas-venta internamente', () => {
    const p = path.join(PROJECT_ROOT, 'app/(app)/notas-venta/client_page.tsx');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain('/api/notas-venta');
    expect(content).toContain('/notas-venta/');  // backtick template literal
    expect(content).not.toContain('/api/prenotas');
  });

  test('notas-venta/[id]/client_page.tsx usa /api/notas-venta internamente', () => {
    const p = path.join(PROJECT_ROOT, 'app/(app)/notas-venta/[id]/client_page.tsx');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain('/api/notas-venta');
    expect(content).toContain("router.push('/notas-venta')");
    expect(content).not.toContain('/api/prenotas');
  });

  // ──── Tipos viejos SOBREVIVEN (diferido a slice futuro) ────

  test('type Prenota sobrevive en client_page.tsx (diferido a slice futuro)', () => {
    const p = path.join(PROJECT_ROOT, 'app/(app)/notas-venta/client_page.tsx');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain('type Prenota');
  });

  test('PrenotasPage sobrevive (diferido a slice futuro)', () => {
    const p = path.join(PROJECT_ROOT, 'app/(app)/notas-venta/client_page.tsx');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain('PrenotasPage');
  });

  // ──── Tests existentes con imports actualizados ────

  test('prenotas.test.ts importa desde nuevas rutas API', () => {
    const p = path.join(PROJECT_ROOT, '__tests__/api/prenotas.test.ts');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain("@/app/api/notas-venta/route");
    expect(content).not.toContain("@/app/api/prenotas/route");
  });

  test('prenota-detalle.test.tsx importa desde nueva ruta', () => {
    const p = path.join(PROJECT_ROOT, '__tests__/prenota-detalle.test.tsx');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain("@/app/(app)/notas-venta/[id]/client_page");
    expect(content).not.toContain("@/app/(app)/prenotas/[id]/client_page");
  });

  test('prenotas-page.test.tsx importa desde nueva ruta', () => {
    const p = path.join(PROJECT_ROOT, '__tests__/prenotas-page.test.tsx');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain("@/app/(app)/notas-venta/client_page");
    expect(content).not.toContain("@/app/(app)/prenotas/client_page");
  });

  test('AgregarAPrenotaModal.test.tsx importa desde nueva ruta', () => {
    const p = path.join(PROJECT_ROOT, '__tests__/AgregarAPrenotaModal.test.tsx');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain("@/components/AgregarANotaVentaModal");
    expect(content).not.toContain("@/components/AgregarAPrenotaModal");
  });

  test('ProductCard-prenota.test.tsx mockea desde nueva ruta', () => {
    const p = path.join(PROJECT_ROOT, '__tests__/ProductCard-prenota.test.tsx');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain("@/components/AgregarANotaVentaModal");
    expect(content).not.toContain("@/components/AgregarAPrenotaModal");
  });
});
