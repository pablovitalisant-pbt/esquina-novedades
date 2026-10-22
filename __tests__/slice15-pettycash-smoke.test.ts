/**
 * Fase B — Slice 15: Smoke de eliminacion Pettycash + fusion -> Caja Mayor
 *
 * Contrato: 17 archivos de codigo eliminados. Caja Mayor sigue operativo.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

const DELETED = [
  'app/api/pettycash/route.ts',
  'app/api/pettycash/[id]/route.ts',
  'app/api/pettycash/[id]/route.test.ts',
  'app/(app)/pettycash/client_page.tsx',
  'app/(app)/pettycash/page.tsx',
  'app/(app)/pettycash/pettycash-utils.ts',
  'app/(app)/pettycash/pettycash-utils.test.ts',
  'app/(app)/pettycash/client_page.smoke.test.tsx',
  'docs/specs/pettycash.spec.ts',
  'migrations/001_pettycash.sql',
  '__tests__/pettycash.test.ts',
  '__tests__/pettycash-ui.test.ts',
];

const FORBIDDEN = [
  'pettycash',
  'Pettycash',
  'PETTYCASH',
  'pettycash_movimientos',
];

describe('Slice 15 — smoke eliminacion Pettycash', () => {

  test.each(DELETED)('%s NO existe en disco', (file) => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, file))).toBe(false);
  });

  test('feature-flags.json NO contiene flags de pettycash', () => {
    const flags = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'config', 'feature-flags.json'), 'utf-8'));
    expect(flags).not.toHaveProperty('pettycash');
    expect(flags).not.toHaveProperty('pettycash-edit-delete');
  });

  test('middleware.ts NO contiene /pettycash', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'middleware.ts'), 'utf-8');
    expect(content).not.toContain('/pettycash');
  });

  test('BottomNav.tsx NO contiene enlace a pettycash', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'components/BottomNav.tsx'), 'utf-8');
    expect(content).not.toContain('/pettycash');
  });

  test('TopNav.tsx NO contiene enlace a pettycash (Toolbar eliminado)', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'components/TopNav.tsx'), 'utf-8');
    expect(content).not.toContain('/pettycash');
  });

  // Guard: Caja Mayor reemplazo funcional sigue operativo
  test('caja/cuentas/route.ts acepta POST (sin cambios necesarios)', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'app/api/caja/cuentas/route.ts'), 'utf-8');
    // El POST debe aceptar nombre, moneda, orden, activa sin restricciones
    expect(content).toContain('INSERT INTO caja_cuentas');
    expect(content).toContain('nombre');
    expect(content).toContain('RETURNING');
  });

  test('ningun archivo fuera de los eliminados referencia pettycash', () => {
    const selfFile = path.resolve(__dirname, 'slice15-pettycash-smoke.test.ts');
    const dirs = ['app', 'components', 'lib', '__tests__', 'docs', 'migrations', 'config']
      .map(d => path.join(PROJECT_ROOT, d))
      .filter(d => fs.existsSync(d));
    const files = dirs.flatMap(d => walkDir(d))
      .filter(f => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.sql') || f.endsWith('.json'))
      .filter(f => !DELETED.map(d => path.join(PROJECT_ROOT, d)).includes(f))
      .filter(f => f !== selfFile)
      .filter(f => !f.includes('slice17-housekeeping'));

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
