/**
 * Fase B — Slice 4: Tests que intentan romper el rename CLP → ARS
 *
 * Contrato: cero referencias a "CLP" en código fuente. "ARS" en su lugar.
 * formatMonto acepta "ARS" como moneda sin decimales (mismo formato que CLP).
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

const FILES = [
  'app/(app)/admin/caja-config/client_page.tsx',
  'app/(app)/caja-mayor/client_page.tsx',
  'app/api/caja/cierres/route.ts',
  'app/api/caja/cuentas/route.ts',
  'app/api/caja/movimientos/route.ts',
  'app/api/caja/movimientos/[id]/route.ts',
  'app/api/caja/resumen/[kcodcli2]/route.ts',
  'app/api/caja/resumen-cuentas/route.ts',
  'app/api/caja/saldos-iniciales/route.ts',
  'docs/specs/caja-mayor.spec.ts',
];

describe('Slice 4 — smoke CLP → ARS', () => {

  // ──── Cero "CLP" en código ────

  test.each(FILES)('%s NO contiene "CLP"', (file) => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
    expect(content).not.toMatch(/"CLP"|'CLP'|`CLP`|as "CLP"|as 'CLP'/);
  });

  // ──── "ARS" presente ────

  test.each(FILES)('%s SÍ contiene "ARS"', (file) => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
    expect(content).toContain('ARS');
  });

  // ──── Sin residuos CLP en labels ────

  test('caja-config NO contiene "Pesos chilenos"', () => {
    const p = path.join(PROJECT_ROOT, 'app/(app)/admin/caja-config/client_page.tsx');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).not.toContain('Pesos chilenos');
    expect(content).not.toContain('Chilenos');
  });

  test('caja-mayor NO contiene "Pesos Chilenos"', () => {
    const p = path.join(PROJECT_ROOT, 'app/(app)/caja-mayor/client_page.tsx');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).not.toContain('Pesos Chilenos');
    expect(content).not.toContain('Chilenos');
  });

  // ──── Labels nuevos ────

  test('caja-config contiene "Pesos argentinos"', () => {
    const p = path.join(PROJECT_ROOT, 'app/(app)/admin/caja-config/client_page.tsx');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain('Pesos argentinos');
  });

  // ──── Archivos NO tocados NO tienen "CLP" ────

  test('types/index.ts NO contiene CLP', () => {
    const p = path.join(PROJECT_ROOT, 'types/index.ts');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).not.toContain('CLP');
  });

  test('middleware.ts NO contiene CLP', () => {
    const p = path.join(PROJECT_ROOT, 'middleware.ts');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).not.toContain('CLP');
  });

  // ──── Verificación extra: zero "CLP" en TODO el árbol de código ────

  test('ningún archivo .ts/.tsx en app/ contiene "CLP"', () => {
    const appDir = path.join(PROJECT_ROOT, 'app');
    const files = walkDir(appDir);
    const clpFiles = files
      .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
      .filter(f => fs.readFileSync(f, 'utf-8').includes('CLP'));
    expect(clpFiles).toEqual([]);
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
