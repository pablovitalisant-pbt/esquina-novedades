/**
 * Fase B — Slice 13: Tests que intentan romper el repunte movidcto -> prenotas
 *
 * Contrato: 6 rutas API de Caja Mayor dejan de referenciar vida.movidcto
 * y sanjh.movidcto. En su lugar usan public.prenotas + public.prenota_items.
 * El spec se actualiza con los nuevos tipos. La UI refleja los nuevos campos.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

const CAJA_API_FILES = [
  'app/api/caja/clientes/route.ts',
  'app/api/caja/notas/[kcodcli2]/route.ts',
  'app/api/caja/nota-busqueda/route.ts',
  'app/api/caja/resumen/[kcodcli2]/route.ts',
  'app/api/caja/movimientos/route.ts',
  'app/api/caja/movimientos/[id]/notas/route.ts',
];

const CAJA_SPEC = 'docs/specs/caja-mayor.spec.ts';
const CAJA_UI = 'app/(app)/caja-mayor/client_page.tsx';

describe('Slice 13 — smoke repunte movidcto -> prenotas', () => {

  // ──── Cero referencias a movidcto en los 6 archivos ────

  test.each(CAJA_API_FILES)('%s NO contiene movidcto', (file) => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
    expect(content).not.toMatch(/vida\.movidcto|sanjh\.movidcto/);
  });

  // ──── Cero referencias a vida./sanjh. en los 6 archivos ────

  test.each(CAJA_API_FILES)('%s NO contiene esquemas vida./sanjh.', (file) => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
    expect(content).not.toMatch(/FROM vida\.|FROM sanjh\.|vida\.\w+|sanjh\.\w+/);
  });

  // ──── Nuevas referencias a prenotas ────

  test.each(CAJA_API_FILES)('%s SI contiene public.prenotas o prenota_items', (file) => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
    const hasPrenotas = content.includes('prenotas') || content.includes('prenota_items');
    expect(hasPrenotas).toBe(true);
  });

  // ──── Spec actualizado ────

  test('spec NO contiene referencias a movidcto', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, CAJA_SPEC), 'utf-8');
    // Excluir comentarios (documentan el cambio)
    const codeOnly = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codeOnly).not.toContain('movidcto');
    expect(codeOnly).not.toContain('knumfoli');
    // BUG-006: kcodcli2 restaurado al schema Zod porque el código del POST
    // aún lo usa (nunca se migró a usuario_id). Verificar que existe.
    expect(codeOnly).toContain('kcodcli2');
  });

  test('spec SI contiene campos nuevos de prenotas', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, CAJA_SPEC), 'utf-8');
    expect(content).toContain('prenota_id');
  });

  // ──── UI actualizada ────

  test('UI NO contiene knumfoli ni literales de empresa WinFac', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, CAJA_UI), 'utf-8');
    expect(content).not.toContain('knumfoli');
    // "vida"/"sanjh" como strings literales de WinFac no deben aparecer
    expect(content).not.toMatch(/"vida"|"sanjh"/);
    // 'empresa' como variable de formulario/filtro es aceptable
  });

  test('UI SI referencia prenota_id', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, CAJA_UI), 'utf-8');
    expect(content).toContain('prenota_id');
  });
});
