import fs from 'fs';
import path from 'path';

// Crece por corte (Slice 3). T1: los archivos migrados no referencian PowerSync.
const MIGRADOS = [
  'components/AppShell.tsx',
  'contexts/AlertasContext.tsx',
  'components/AlertasBell.tsx',
  'app/(app)/alertas-stock/client_page.tsx',
  'app/(app)/admin/usuarios/client_page.tsx',
  'app/(app)/catalogo/admin/client_page.tsx',
  'app/(app)/alertas-stock/client_page.test.tsx',
  'app/(app)/admin/usuarios/client_page.test.tsx',
  'app/(app)/catalogo/admin/client_page.test.tsx',
  'app/(app)/clientes/client_page.tsx',
  'app/(app)/precios/client_page.tsx',
  'app/(app)/bodega/client_page.tsx',
  'app/(app)/admin/caja-config/client_page.tsx',
  'app/(app)/clientes/client_page.test.tsx',
  'app/(app)/precios/client_page.test.tsx',
  'app/(app)/bodega/client_page.test.tsx',
  'app/(app)/admin/caja-config/client_page.test.tsx',
  '__tests__/precios-eliminar-producto-ui.test.tsx',
  '__tests__/bodega-client_page.test.tsx',
  '__tests__/caja-config-client_page.test.tsx',
  'app/(app)/admin/categorias/client_page.tsx',
  'app/(app)/notas-venta/client_page.tsx',
  'app/(app)/notas-venta/client_page.test.tsx',
  'app/(app)/notas-venta/[id]/client_page.tsx',
  'app/(app)/notas-venta/[id]/client_page.test.tsx',
  '__tests__/notas-venta-eliminar-item.test.tsx',
  '__tests__/notas-venta-guardar-item.test.tsx',
  '__tests__/notas-venta-compartir-whatsapp.test.tsx',
  '__tests__/notas-venta-exportar-pdf.test.tsx',
  'app/(app)/caja-mayor/client_page.tsx',
  'app/(app)/caja-mayor/client_page.test.tsx',
  '__tests__/caja-mayor-bug054-ui.test.tsx',
];
const PROHIBIDO = /@powersync|lib\/powersync|usePowerSync|OFFLINE_READ|wa-sqlite|offline-lectura|alertas-badge-offline/;

describe('Slice 3 — T1 sin PowerSync en archivos migrados', () => {
  it.each(MIGRADOS)('%s', (f) => {
    const src = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
    expect(src).not.toMatch(PROHIBIDO);
  });
});

// T2/T5/T-final (3.10 + 3.11)
const ROOT = process.cwd();
const leer = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const recorrer = (d: string): string[] =>
  fs.existsSync(path.join(ROOT, d))
    ? fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => {
        const rel = path.posix.join(d, e.name);
        return e.isDirectory() ? recorrer(rel) : /\.(tsx?|mjs|json)$/.test(e.name) ? [rel] : [];
      })
    : [];

describe('Slice 3 — cierre (3.10 + 3.11)', () => {
  it('T2 flags: solo los 5 esperados', () => {
    const keys = Object.keys(JSON.parse(leer('config/feature-flags.json'))).sort();
    expect(keys.filter((k) => /offline|sync-conflictos/.test(k))).toEqual([]);
    expect(keys).toHaveLength(5);
    expect(leer('.env.example')).not.toMatch(/POWERSYNC/);
  });

  it.each([
    'lib/powersync', 'app/api/powersync', 'app/api/sync-conflictos',
    'app/(app)/admin/powersync-status', 'app/(app)/admin/sync-conflictos',
    'app/offline', 'app/sw.ts', 'lib/sw-images.ts', 'public/sw.js',
  ])('T5 no existe %s', (p) => expect(fs.existsSync(path.join(ROOT, p))).toBe(false));

  it('T5 manifest se conserva', () => {
    expect(fs.existsSync(path.join(ROOT, 'public/manifest.json'))).toBe(true);
    expect(leer('app/layout.tsx')).toContain('manifest:');
  });

  it('T-final sin powersync|wa-sqlite|serwist (app/api exento, D6)', () => {
    const archivos = [
      ...['app', 'components', 'contexts', 'hooks', 'lib', 'utils', 'types', 'scripts', '__tests__'].flatMap(recorrer),
      'middleware.ts', 'next.config.mjs', 'tsconfig.json',
    ].filter((f) => !f.startsWith('app/api/') && !f.endsWith('slice-03-sin-powersync.test.ts'));
    const sucios = archivos.filter((f) => fs.existsSync(path.join(ROOT, f)) && /powersync|wa-sqlite|serwist/i.test(leer(f)));
    expect(sucios).toEqual([]);
  });

  it('T-final package.json y configs', () => {
    const pkg = JSON.parse(leer('package.json'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const d of ['@powersync/react', '@powersync/web', '@journeyapps/wa-sqlite', '@serwist/next', 'serwist', 'jose'])
      expect(deps[d]).toBeUndefined();
    expect(leer('next.config.mjs')).not.toMatch(/wasm|asyncWebAssembly|withSerwist/);
    expect(leer('tsconfig.json')).not.toMatch(/serwist|webworker/);
    const mw = leer('middleware.ts');
    expect(mw).not.toMatch(/offline|sw\\\.js/);
    for (const k of ['login', 'api/', 'catalogo', 'productos', '_next/static']) expect(mw).toContain(k);
  });
});
