/**
 * Ingreso de Mercadería: item presente en AMBOS navs (regresión TopNav).
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

describe('/bodega/ingresos — item en AMBOS navs (regresión TopNav)', () => {
  const TOPNAV = fs.readFileSync(path.join(PROJECT_ROOT, 'components/TopNav.tsx'), 'utf-8');
  const BOTTOMNAV = fs.readFileSync(path.join(PROJECT_ROOT, 'components/BottomNav.tsx'), 'utf-8');

  test('client_page.tsx existe', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'app/(app)/bodega/ingresos/client_page.tsx'))).toBe(true);
  });

  test('TopNav.tsx tiene el item de ingreso', () => {
    expect(TOPNAV).toContain('/bodega/ingresos');
    expect(TOPNAV).toContain('Ingreso de Mercadería');
  });

  test('TopNav.tsx importa PackagePlus', () => {
    expect(TOPNAV).toMatch(/import\s*\{[\s\S]*PackagePlus[\s\S]*\}\s*from 'lucide-react'/);
  });

  test('BottomNav.tsx tiene el item de ingreso', () => {
    expect(BOTTOMNAV).toContain('/bodega/ingresos');
  });
});
