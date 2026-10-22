/**
 * Fase B — Ingreso de Mercadería: guard por feature flag + nav gated.
 *
 * El módulo arranca apagado (ingreso-mercaderia=false). La página muestra el
 * mensaje guard antes de renderizar el client, y la nav solo lo expone con el
 * flag en true.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

describe('/bodega/ingresos — guard smoke', () => {

  test('feature-flags.json tiene ingreso-mercaderia (boolean)', () => {
    const flags = JSON.parse(
      fs.readFileSync(path.join(PROJECT_ROOT, 'config', 'feature-flags.json'), 'utf-8')
    );
    // El valor es operacional (false por defecto, true durante la prueba real);
    // se valida solo que la key exista con tipo correcto para que no se borre.
    expect(flags).toHaveProperty('ingreso-mercaderia');
    expect(typeof flags['ingreso-mercaderia']).toBe('boolean');
  });

  test('page.tsx lee el flag y muestra el mensaje guard', () => {
    const content = fs.readFileSync(
      path.join(PROJECT_ROOT, 'app/(app)/bodega/ingresos/page.tsx'),
      'utf-8'
    );
    expect(content).toContain('feature-flags.json');
    expect(content).toContain('ingreso-mercaderia');
    expect(content).toContain('no está disponible en esta versión');
  });

  test('client_page.tsx existe (recuperable cuando se encienda el flag)', () => {
    const clientExists = fs.existsSync(
      path.join(PROJECT_ROOT, 'app/(app)/bodega/ingresos/client_page.tsx')
    );
    expect(clientExists).toBe(true);
  });
});

describe('/bodega/ingresos — item en AMBOS navs (regresión TopNav)', () => {
  const TOPNAV = fs.readFileSync(
    path.join(PROJECT_ROOT, 'components/TopNav.tsx'),
    'utf-8'
  );
  const BOTTOMNAV = fs.readFileSync(
    path.join(PROJECT_ROOT, 'components/BottomNav.tsx'),
    'utf-8'
  );

  test('TopNav.tsx tiene el item de ingreso gateado por ingreso-mercaderia', () => {
    expect(TOPNAV).toContain("['ingreso-mercaderia']");
    expect(TOPNAV).toContain('/bodega/ingresos');
    expect(TOPNAV).toContain('Ingreso de Mercadería');
  });

  test('TopNav.tsx importa PackagePlus', () => {
    expect(TOPNAV).toMatch(/import\s*\{[\s\S]*PackagePlus[\s\S]*\}\s*from 'lucide-react'/);
  });

  test('BottomNav.tsx sigue teniendo el item gateado', () => {
    expect(BOTTOMNAV).toContain("['ingreso-mercaderia']");
    expect(BOTTOMNAV).toContain('/bodega/ingresos');
  });
});
