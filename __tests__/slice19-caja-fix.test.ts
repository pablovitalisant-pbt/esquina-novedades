/**
 * Fase B — Slice 19: Tests que intentan romper el fix Caja Mayor.
 *
 * Contrato: usuario_id -> cliente_id en 6 rutas de Caja Mayor.
 * JOIN a clientes en clientes/route.ts. Notas sin cliente_id excluidas.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

const CAJA_FILES = [
  'app/api/caja/clientes/route.ts',
  'app/api/caja/notas/[kcodcli2]/route.ts',
  'app/api/caja/nota-busqueda/route.ts',
  'app/api/caja/resumen/[kcodcli2]/route.ts',
  'app/api/caja/movimientos/route.ts',
  'app/api/caja/movimientos/[id]/notas/route.ts',
];

const CAJA_UI = 'app/(app)/caja-mayor/client_page.tsx';

describe('Slice 19 — smoke fix Caja Mayor', () => {

  // ──── Cero referencias a usuario_id como filtro de prenotas ────

  test.each(CAJA_FILES)('%s NO contiene p.usuario_id', (file) => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
    expect(content).not.toMatch(/p\.usuario_id/);
  });

  // ──── cliente_id presente en los 6 archivos ────

  test.each(CAJA_FILES)('%s SI contiene cliente_id', (file) => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
    expect(content).toContain('cliente_id');
  });

  // ──── clientes/route.ts usa JOIN a clientes ────

  test('clientes/route.ts JOIN a public.clientes', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'app/api/caja/clientes/route.ts'), 'utf-8');
    expect(content).toContain('JOIN public.clientes');
  });

  // ──── UI: usuario_id -> cliente_id ────
  // Nota: se chequea `p.usuario_id` (filtro de prenotas por usuario, el bug de
  // Slice 19), no el bare `usuario_id` — la query offline de movimientos
  // replica el endpoint que selecciona `m.usuario_id` como columna (igual que
  // movimientos/route.ts), lo cual es legítimo y no reintroduce el bug.

  test('UI NO contiene p.usuario_id en contexto de cliente', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, CAJA_UI), 'utf-8');
    expect(content).not.toMatch(/p\.usuario_id/);
  });
});
