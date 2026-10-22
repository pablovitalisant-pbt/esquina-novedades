/**
 * Fase B — Slice 28: Tests contra el CONTRATO OBJETIVO (post-fix mockClear).
 * DEBEN estar en ROJO ahora y en VERDE en Fase C.
 *
 * Contrato: 9 archivos, 15 ocurrencias de mockReset() → mockClear().
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

const FILES = [
  '__tests__/admin-productos-lista.test.ts',
  '__tests__/api/categorias.test.ts',
  '__tests__/catalogo-solo-nuevo-fix.test.ts',
  '__tests__/precios-api-empresa.test.ts',
  '__tests__/productos-put-categoria-lotes.test.ts',
  '__tests__/productos-put-categoria-multiempresa.test.ts',
  '__tests__/productos-put-categoria.test.ts',
];

describe('Slice 28 — Fase B: mockReset→mockClear 9 archivos (contra contrato objetivo)', () => {

  test.each(FILES)('%s NO contiene mockReset()', (file) => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
    expect(content).not.toContain('mockReset()');
  });

  test.each(FILES)('%s USA mockClear()', (file) => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
    expect(content).toContain('mockClear()');
  });
});
