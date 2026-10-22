/**
 * Fase B — Slice 7: Smoke de eliminacion de tests/specs huerfanos
 *
 * Contrato: 5 archivos eliminados. Cero referencias externas.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

const DELETED = [
  '__tests__/sueldos-ui.test.ts',
  '__tests__/sueldos.test.ts',
  'docs/specs/sueldos.spec.ts',
  'docs/specs/deudas.spec.ts',
  'docs/specs/deudas.spec.test.ts',
];

describe('Slice 7 — smoke sueldos/deudas', () => {

  test.each(DELETED)('%s NO existe en disco', (file) => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, file))).toBe(false);
  });

  test('ningun archivo .ts/.tsx referencia a sueldos-ui, sueldos.spec o deudas.spec', () => {
    const dirs = ['app', 'components', 'lib', '__tests__', 'docs', 'hooks', 'contexts', 'utils']
      .map(d => path.join(PROJECT_ROOT, d))
      .filter(d => fs.existsSync(d));
    const selfFile = path.resolve(__dirname, 'slice7-sueldos-deudas-smoke.test.ts');
    const files = dirs.flatMap(d => walkDir(d))
      .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
      .filter(f => !DELETED.map(d => path.join(PROJECT_ROOT, d)).includes(f))
      .filter(f => f !== selfFile);

    const FORBIDDEN = ['sueldos-ui', 'sueldos.spec', 'deudas.spec', 'sueldos-utils'];
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
