/**
 * Fase B — Slice 6: Smoke de eliminacion de dead code
 *
 * Contrato: 5 archivos eliminados. Cero referencias residuales.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

const DELETED = [
  'scripts/migrate-caja-mayor.ts',
  'scripts/fix_syntax.js',
  'lib/excel.ts',
  'src/index.cjs',
  'src/index.cjs.bak.20251015171418',
];

const FORBIDDEN_IMPORTS = [
  'migrate-caja-mayor',
  'fix_syntax',
  '@/lib/excel',
  'lib/excel',
  'index.cjs',
];

describe('Slice 6 — smoke de eliminacion dead code', () => {

  // ──── Archivos eliminados ────

  test.each(DELETED)('%s NO existe en disco', (file) => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, file))).toBe(false);
  });

  // ──── Cero referencias en codigo fuente ────

  test('ningun archivo .ts/.tsx referencia los modulos eliminados', () => {
    const dirs = ['app', 'components', 'lib', 'scripts', 'hooks', 'contexts', 'utils', 'config', 'types']
      .map(d => path.join(PROJECT_ROOT, d))
      .filter(d => fs.existsSync(d));

    const files = dirs.flatMap(d => walkDir(d))
      .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));

    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of FORBIDDEN_IMPORTS) {
        if (content.includes(pattern)) {
          violations.push(`${file}: referencia a ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  // ──── Directorios vacios eliminados ────

  test('src/ ya no existe (quedaba vacio)', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'src'))).toBe(false);
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
