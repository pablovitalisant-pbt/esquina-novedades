/**
 * Fase B — Slice /despachos: guard por feature flag + ocultar de nav
 *
 * Contrato: 5 archivos — feature flag, guard en page, limpiar 2 navs, PRD.
 * El módulo /bodega/despachos tiene frontend completo pero backend
 * (app/api/despachos/) nunca existió. Se apaga con flag despachos-ia=false.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

describe('/despachos — guard smoke', () => {

  test('feature-flags.json tiene despachos-ia = false', () => {
    const flags = JSON.parse(
      fs.readFileSync(path.join(PROJECT_ROOT, 'config', 'feature-flags.json'), 'utf-8')
    );
    expect(flags).toHaveProperty('despachos-ia');
    expect(flags['despachos-ia']).toBe(false);
  });

  test('page.tsx NO renderiza DespachosClient sin verificar flag', () => {
    const content = fs.readFileSync(
      path.join(PROJECT_ROOT, 'app/(app)/bodega/despachos/page.tsx'),
      'utf-8'
    );
    // Debe leer el flag y mostrar el mensaje guard antes de renderizar el client
    expect(content).toContain('feature-flags.json');
    expect(content).toContain('despachos-ia');
    expect(content).toContain('no está disponible');
  });

  test('page.tsx muestra mensaje de guard', () => {
    const content = fs.readFileSync(
      path.join(PROJECT_ROOT, 'app/(app)/bodega/despachos/page.tsx'),
      'utf-8'
    );
    expect(content).toContain('Este módulo no está disponible en esta versión');
  });

  test('TopNav.tsx NO contiene enlace a /bodega/despachos', () => {
    const content = fs.readFileSync(
      path.join(PROJECT_ROOT, 'components/TopNav.tsx'),
      'utf-8'
    );
    expect(content).not.toContain('/bodega/despachos');
  });

  test('TopNav.tsx NO tiene import huérfano de Camera (solo se usaba para Despachos)', () => {
    const content = fs.readFileSync(
      path.join(PROJECT_ROOT, 'components/TopNav.tsx'),
      'utf-8'
    );
    expect(content).not.toContain('Camera');
  });

  test('BottomNav.tsx NO contiene enlace a /bodega/despachos', () => {
    const content = fs.readFileSync(
      path.join(PROJECT_ROOT, 'components/BottomNav.tsx'),
      'utf-8'
    );
    expect(content).not.toContain('/bodega/despachos');
  });

  test('BottomNav.tsx NO tiene import huérfano de Camera', () => {
    const content = fs.readFileSync(
      path.join(PROJECT_ROOT, 'components/BottomNav.tsx'),
      'utf-8'
    );
    expect(content).not.toContain('Camera');
  });

  test('client_page.tsx y test existen (no se borran — recuperables)', () => {
    const clientExists = fs.existsSync(
      path.join(PROJECT_ROOT, 'app/(app)/bodega/despachos/client_page.tsx')
    );
    const testExists = fs.existsSync(
      path.join(PROJECT_ROOT, 'app/(app)/bodega/despachos/client_page.test.tsx')
    );
    expect(clientExists).toBe(true);
    expect(testExists).toBe(true);
  });
});
