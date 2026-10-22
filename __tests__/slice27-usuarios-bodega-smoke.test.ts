/**
 * Slice 27: Usuarios + Bodega test cleanup.
 * Actualizado post-Slice Usuarios single-tenant: catalogList ya no existe en page.tsx
 * (el hardcodeo de empresa_id=1 se movió a las rutas API y client_page.tsx).
 *
 * Estado post-slice Usuarios:
 * 1. admin/usuarios/page.tsx: sin query empresas, sin catalogList,
 *    pasa solo currentUserId al client component
 * 2. __tests__/bodega-client_page.test.tsx: sin empresasMap prop en render
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

describe('Slice 27 — Usuarios + Bodega test cleanup (actualizado post-Usuarios single-tenant)', () => {

  // -----------------------------------------------------------------------
  // Ítem 1: admin/usuarios/page.tsx — server component mínimo
  // -----------------------------------------------------------------------

  const USUARIOS_PAGE = path.join(PROJECT_ROOT, 'app/(app)/admin/usuarios/page.tsx');
  const usuariosPage = fs.readFileSync(USUARIOS_PAGE, 'utf-8');

  test('usuarios/page.tsx NO consulta tabla empresas', () => {
    expect(usuariosPage).not.toContain('FROM empresas');
  });

  test('usuarios/page.tsx NO contiene empresasDesc', () => {
    expect(usuariosPage).not.toContain('empresasDesc');
  });

  test('usuarios/page.tsx NO importa sql (sin query ya no se necesita)', () => {
    expect(usuariosPage).not.toContain("import { sql }");
  });

  test('usuarios/page.tsx NO contiene catalogList (hardcodeo movido a rutas API)', () => {
    expect(usuariosPage).not.toContain('catalogList');
  });

  test('usuarios/page.tsx NO pasa empresasList prop (eliminado del componente)', () => {
    expect(usuariosPage).not.toContain('empresasList');
  });

  test('usuarios/page.tsx pasa currentUserId directamente', () => {
    expect(usuariosPage).toContain('currentUserId');
  });

  // -----------------------------------------------------------------------
  // Ítem 2: __tests__/bodega-client_page.test.tsx — sin empresasMap
  // -----------------------------------------------------------------------

  const BODEGA_TEST = path.join(PROJECT_ROOT, '__tests__/bodega-client_page.test.tsx');
  const bodegaTest = fs.readFileSync(BODEGA_TEST, 'utf-8');

  test('bodega-client_page.test.tsx NO pasa empresasMap en render', () => {
    expect(bodegaTest).not.toContain('empresasMap');
  });
});
