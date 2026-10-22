/**
 * Fase B — Slice 5: Tests que intentan romper la limpieza de package.json
 *
 * Contrato: 9 dependencias eliminadas de package.json.
 * Las dependencias que se mantienen (sharp, next-themes, etc.) sobreviven.
 * El build compila sin las dependencias removidas.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const pkgPath = path.join(PROJECT_ROOT, 'package.json');

const REMOVED_DEPS = [
  'next-cloudinary',
  'tw-animate-css',
  'jszip',
  '@dnd-kit/sortable',
  'react-hook-form',
  '@hookform/resolvers',
  'undici',
  '@types/sharp',
];

const KEPT_DEPS = [
  '@dnd-kit/core',
  'sharp',
  'next-themes',
  '@base-ui/react',
  'xlsx',
  'exceljs',
  'cloudinary',
  'lucide-react',
  'sonner',
  'zod',
  'date-fns',
  'next',
  'next-auth',
  '@neondatabase/serverless',
];

function getDeps(): Record<string, string> {
  const raw = fs.readFileSync(pkgPath, 'utf-8');
  const pkg = JSON.parse(raw);
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

describe('Slice 5 — smoke de limpieza package.json', () => {

  // ──── Dependencias eliminadas ────

  test.each(REMOVED_DEPS)('%s NO está en package.json', (dep) => {
    const deps = getDeps();
    expect(deps).not.toHaveProperty(dep);
  });

  // ──── Dependencias mantenidas ────

  test.each(KEPT_DEPS)('%s SÍ está en package.json', (dep) => {
    const deps = getDeps();
    expect(deps).toHaveProperty(dep);
  });

  // ──── Sanity: el archivo es JSON válido ────

  test('package.json es JSON válido', () => {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  // ──── Ningún archivo de código importa los paquetes eliminados ────

  test('ningún archivo .ts/.tsx importa dependencias eliminadas', () => {
    const appDir = path.join(PROJECT_ROOT, 'app');
    const compDir = path.join(PROJECT_ROOT, 'components');
    const libDir = path.join(PROJECT_ROOT, 'lib');
    const hooksDir = path.join(PROJECT_ROOT, 'hooks');
    const dirs = [appDir, compDir, libDir, hooksDir].filter(d => fs.existsSync(d));

    const files = dirs.flatMap(d => walkDir(d)).filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));

    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const dep of REMOVED_DEPS) {
        if (content.includes(`'${dep}'`) || content.includes(`"${dep}"`)) {
          violations.push(`${file}: importa ${dep}`);
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
