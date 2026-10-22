import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

const DELETED = [
  '__tests__/importar-empresa-autodetect.test.ts',
  '__tests__/sync-from-winfac.test.ts',
  '__tests__/sync-ubicaciones.test.ts',
  '__tests__/dashboard-client.test.tsx',
  '__tests__/dashboard-columnas-ui.test.tsx',
  '__tests__/dashboard-despachos.test.ts',
  '__tests__/dashboard-despachos.test.tsx',
  '__tests__/dashboard-stock-compare.test.tsx',
  '__tests__/api-despachos-columnas.test.ts',
];

const FORBIDDEN = [
  'importar-empresa-autodetect',
  'sync-from-winfac',
  'sync-ubicaciones',
  'dashboard-utils',
  'dashboard/client_page',
  'dashboard/despachos',
  'filterDespachosHoy',
  'DashboardClient',
];

describe('Slice 10 — smoke tests huerfanos', () => {

  test.each(DELETED)('%s NO existe en disco', (file) => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, file))).toBe(false);
  });

  test('ningun archivo fuera de los eliminados referencia los patrones', () => {
    const selfFile = path.resolve(__dirname, 'slice10-tests-smoke.test.ts');
    const dirs = ['app', 'components', 'lib', '__tests__', 'docs', 'utils', 'hooks', 'contexts']
      .map(d => path.join(PROJECT_ROOT, d))
      .filter(d => fs.existsSync(d));
    const files = dirs.flatMap(d => walkDir(d))
      .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
      .filter(f => !DELETED.map(d => path.join(PROJECT_ROOT, d)).includes(f))
      .filter(f => f !== selfFile);

    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of FORBIDDEN) {
        if (content.includes(pattern)) {
          violations.push(`${file}: ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

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
