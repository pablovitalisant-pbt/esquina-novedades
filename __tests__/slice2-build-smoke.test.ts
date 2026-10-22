/**
 * Fase B — Slice 2: Smoke test de build post-limpieza
 *
 * Contrato: el build pasa de 3 errores a 0. Los archivos sync,
 * catalog-image, categorizar-productos y dolar-observado dejan de existir.
 * Los 13 flags huérfanos desaparecen de feature-flags.json.
 *
 * Este test NO ejecuta el build (es lento). Verifica que los archivos
 * eliminados ya no existen en disco y que feature-flags.json solo contiene
 * los flags esperados.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

const DELETED_FILES = [
  'app/api/admin/categorizar-productos/route.ts',
  'app/api/catalog-image/generate/route.ts',
  'app/api/caja/dolar-observado/route.ts',
  'app/(app)/catalog-image/page.tsx',
  'components/catalog-image/CatalogImageGenerator.tsx',
  'lib/sync-clientes-nuevos.ts',
  'lib/services/sync-post-process.ts',
  'lib/sync-client-ratings.ts',
  'tests/lib/sync-post-process.test.ts',
  '__tests__/sync-clientes-nuevos.test.ts',
  '__tests__/sync-clientes-nuevos-match.test.ts',
  '__tests__/sync-clientes-nuevos-phone.test.ts',
  '__tests__/sync-client-ratings.test.ts',
  '__tests__/api/categorizar-productos.test.ts',
];

const REMOVED_FLAGS = [
  'catalog-image',
  'sync-post-process-unificado',
  'fix-company-switcher',
  'fix-company-switcher-mobile',
  'company-switcher-visible',
  'seguimientos',
  'unified_sync',
  'dashboard_despachos_recientes',
  'dashboard_layout_v2',
  'deudas-historial-unificado',
  'sueldos',
  'deudas',
  'garantias-mejoras-slice1',
];

describe('Slice 2 — smoke de eliminaciones', () => {
  // ──── Archivos eliminados ────

  test.each(DELETED_FILES)('el archivo eliminado NO existe: %s', (filePath) => {
    const fullPath = path.join(PROJECT_ROOT, filePath);
    expect(fs.existsSync(fullPath)).toBe(false);
  });

  // ──── Flags ────

  test('feature-flags.json NO contiene los 13 flags huérfanos', () => {
    const flagsPath = path.join(PROJECT_ROOT, 'config', 'feature-flags.json');
    const raw = fs.readFileSync(flagsPath, 'utf-8');
    const flags = JSON.parse(raw);

    for (const flag of REMOVED_FLAGS) {
      expect(flags).not.toHaveProperty(flag);
    }
  });

  // ──── Archivos NO tocados ────

  test('caja-config/client_page.tsx sigue existiendo (no se toca)', () => {
    const p = path.join(PROJECT_ROOT, 'app/(app)/admin/caja-config/client_page.tsx');
    expect(fs.existsSync(p)).toBe(true);
  });

  test('No quedan imports a @/lib/gemini en app/', () => {
    const appDir = path.join(PROJECT_ROOT, 'app');
    const files = walkDir(appDir);
    const geminiImports = files
      .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
      .filter(f => {
        const content = fs.readFileSync(f, 'utf-8');
        return content.includes('@/lib/gemini') || content.includes('@/lib/bcentral');
      });
    expect(geminiImports).toEqual([]);
  });

  test('No quedan imports a sync files desde app/', () => {
    const appDir = path.join(PROJECT_ROOT, 'app');
    const files = walkDir(appDir);
    const syncImports = files
      .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
      .filter(f => {
        const content = fs.readFileSync(f, 'utf-8');
        return content.includes('sync-clientes-nuevos') ||
               content.includes('sync-client-ratings') ||
               content.includes('sync-post-process');
      });
    expect(syncImports).toEqual([]);
  });

  // ──── Fase D: catalogos-utils adaptado ────

  test('filtrarCatalogos existe en catalogo/admin/client_page.tsx y es exportado', () => {
    const p = path.join(PROJECT_ROOT, 'app/(app)/catalogo/admin/client_page.tsx');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain('export function filtrarCatalogos');
  });

  test('catalogos-utils.test.ts importa desde la nueva ubicacion', () => {
    const p = path.join(PROJECT_ROOT, '__tests__/catalogos-utils.test.ts');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain("from '../app/(app)/catalogo/admin/client_page'");
  });
});

// ──── Helper ────

function walkDir(dir: string): string[] {
  const results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const entry of list) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory() && entry !== 'node_modules' && !entry.startsWith('.')) {
      results.push(...walkDir(full));
    } else if (stat.isFile()) {
      results.push(full);
    }
  }
  return results;
}
