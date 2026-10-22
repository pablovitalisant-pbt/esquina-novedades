/**
 * Fase B — Slice 8: Smoke de eliminacion cadena clientes-nuevos
 *
 * Contrato: 12 archivos eliminados, flag clientes-nuevos-visible removido,
 * cero referencias residuales.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

const DELETED = [
  'app/(app)/clientes-nuevos/client_page.tsx',
  'app/(app)/clientes-nuevos/page.tsx',
  'app/api/conversion-sugerencias/route.ts',
  'app/api/conversion-sugerencias/[id]/route.ts',
  'app/api/clientes/[kcodclie]/rating/route.ts',
  'lib/phone-utils.ts',
  '__tests__/clientes-nuevos-page.test.tsx',
  '__tests__/conversion-sugerencias-ui.test.tsx',
  '__tests__/api/conversion-sugerencias.test.ts',
  '__tests__/api/cliente-rating.test.ts',
  '__tests__/api/clientes-nuevos-filtro.test.ts',
  '__tests__/phone-utils.test.ts',
];

// NOTA: no incluir 'clientes-nuevos' solo — matchea 'sync-clientes-nuevos'
// (archivos sync de Slice 2, no relacionados). Usar patrones especificos.
const FORBIDDEN = [
  'clientes-nuevos-visible',
  'clientes-nuevos/client_page',
  'clientes-nuevos/page',
  'conversion-sugerencias',
  'phone-utils',
  'cliente-rating',
  'clientes_deseados',
];

describe('Slice 8 — smoke clientes-nuevos', () => {

  test.each(DELETED)('%s NO existe en disco', (file) => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, file))).toBe(false);
  });

  test('feature-flags.json NO contiene clientes-nuevos-visible', () => {
    const flags = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'config', 'feature-flags.json'), 'utf-8'));
    expect(flags).not.toHaveProperty('clientes-nuevos-visible');
  });

  test('ningun archivo .ts/.tsx fuera de los eliminados referencia la cadena', () => {
    const selfFile = path.resolve(__dirname, 'slice8-clientes-smoke.test.ts');
    const dirs = ['app', 'components', 'lib', '__tests__', 'docs', 'hooks', 'contexts', 'utils']
      .map(d => path.join(PROJECT_ROOT, d))
      .filter(d => fs.existsSync(d));
    const files = dirs.flatMap(d => walkDir(d))
      .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
      .filter(f => !DELETED.map(d => path.join(PROJECT_ROOT, d)).includes(f))
      .filter(f => f !== selfFile)
      .filter(f => !f.includes('slice11-housekeeping'));

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
