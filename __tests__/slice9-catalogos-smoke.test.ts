/**
 * Fase B — Slice 9: Smoke de eliminacion catalogos por cliente + product-service
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

const DELETED = [
  'lib/services/product-service.ts',
  'utils/shipment-logic.ts',
  '__tests__/catalogos-cliente-api.test.ts',
  '__tests__/catalogos-filtros.test.ts',
  '__tests__/catalogos-user-scope.test.ts',
  '__tests__/api/catalogos-categoria.test.ts',
  '__tests__/shipment-logic.test.ts',
];

const FORBIDDEN = [
  'product-service',
  'shipment-logic',
  'catalogos-cliente-api',
  'catalogos-filtros',
  'catalogos-user-scope',
  'catalogos-categoria',
];

describe('Slice 9 — smoke catalogos + product-service', () => {

  test.each(DELETED)('%s NO existe en disco', (file) => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, file))).toBe(false);
  });

  test('catalogo-solo-nuevo.test.ts NO importa shipment-logic', () => {
    const p = path.join(PROJECT_ROOT, '__tests__/catalogo-solo-nuevo.test.ts');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).not.toContain('shipment-logic');
    expect(content).not.toContain('getTopShipmentKeys');
  });

  test('catalogo-ingreso.ts + test SIGUEN existiendo (MVP)', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'utils/catalogo-ingreso.ts'))).toBe(true);
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'utils/catalogo-ingreso.test.ts'))).toBe(true);
  });

  test('ningun archivo fuera de los eliminados referencia los patrones', () => {
    const selfFile = path.resolve(__dirname, 'slice9-catalogos-smoke.test.ts');
    const dirs = ['app', 'components', 'lib', 'utils', '__tests__', 'docs']
      .map(d => path.join(PROJECT_ROOT, d))
      .filter(d => fs.existsSync(d));
    const files = dirs.flatMap(d => walkDir(d))
      .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
      .filter(f => !DELETED.map(d => path.join(PROJECT_ROOT, d)).includes(f))
      .filter(f => f !== selfFile)
      .filter(f => !f.includes('catalogo-solo-nuevo.test')); // editado en Slice 9

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
