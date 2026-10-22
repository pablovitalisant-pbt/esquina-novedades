/**
 * Fase B — Slice 22: Tests contra el CONTRATO OBJETIVO (post-fix).
 * DEBEN estar en ROJO ahora (10/10 fallan) y en VERDE en Fase C.
 *
 * Contrato objetivo:
 * 1. page.tsx NO consulta tabla empresas, NO construye empresasMap
 * 2. client_page.tsx NO recibe empresasMap como prop, hardcodea 'bazar-naty'
 * 3. registro-notas/route.test.ts usa jest.mock, NO vitest
 * 5. Despachos test usa getByText con selector semántico, no crudo
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

describe('Slice 22 — Fase B: Bodega (contra contrato objetivo)', () => {

  // -----------------------------------------------------------------------
  // Ítem 1: page.tsx — sin empresas, sin empresasMap
  // -----------------------------------------------------------------------

  const PAGE_TSX = path.join(PROJECT_ROOT, 'app/(app)/bodega/page.tsx');
  const pageContent = fs.readFileSync(PAGE_TSX, 'utf-8');

  test('page.tsx NO consulta tabla empresas', () => {
    expect(pageContent).not.toContain('FROM empresas');
  });

  test('page.tsx NO construye empresasMap', () => {
    expect(pageContent).not.toContain('empresasMap');
  });

  // -----------------------------------------------------------------------
  // Ítem 2: client_page.tsx — sin empresasMap como prop
  // -----------------------------------------------------------------------

  const CLIENT_TSX = path.join(PROJECT_ROOT, 'app/(app)/bodega/client_page.tsx');
  const clientContent = fs.readFileSync(CLIENT_TSX, 'utf-8');

  test('client_page.tsx NO recibe empresasMap en la firma', () => {
    expect(clientContent).not.toContain('empresasMap');
  });

  test('client_page.tsx hardcodea empresaSlug = bazar-naty (single-tenant, migracion 018)', () => {
    expect(clientContent).toContain("= 'bazar-naty'");
  });

  // -----------------------------------------------------------------------
  // Ítem 4: registro-notas/route.test.ts — Jest, no vitest
  // -----------------------------------------------------------------------

  const ROUTE_TEST = path.join(PROJECT_ROOT, 'app/api/bodega/registro-notas/route.test.ts');
  const routeTestContent = fs.readFileSync(ROUTE_TEST, 'utf-8');

  test('route.test.ts NO usa vi.mock', () => {
    expect(routeTestContent).not.toContain('vi.mock');
  });

  test('route.test.ts NO usa vi.mocked', () => {
    expect(routeTestContent).not.toContain('vi.mocked');
  });

  test('route.test.ts NO importa desde vitest', () => {
    expect(routeTestContent).not.toContain("from 'vitest'");
  });

  test('route.test.ts USA jest.mock', () => {
    expect(routeTestContent).toContain('jest.mock');
  });

  // -----------------------------------------------------------------------
  // Ítem 5: Despachos client_page.test.tsx — query semántica con selector
  // -----------------------------------------------------------------------

  const DESP_TEST = path.join(PROJECT_ROOT, 'app/(app)/bodega/despachos/client_page.test.tsx');
  const despTestContent = fs.readFileSync(DESP_TEST, 'utf-8');

  test('Despachos test usa selector semántico para getByText del folio', () => {
    // getByText crudo sin selector ya no debe existir
    expect(despTestContent).not.toMatch(/getByText\('12345'\)/);
    // Debe usar una query con selector (ej. selector: 'p')
    expect(despTestContent).toMatch(/getByText\('12345'.*selector/);
  });
});
