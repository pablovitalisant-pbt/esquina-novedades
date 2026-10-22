/**
 * Fase B — quitar formatRut() del login.
 * El input "Documento de identidad" no debe aplicar formato chileno.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('Login — formatRut eliminado del onChange', () => {
  const content = fs.readFileSync(path.join(ROOT, 'app/(auth)/login/page.tsx'), 'utf-8');

  test('NO importa formatRut de lib/utils', () => {
    expect(content).not.toMatch(/import.*formatRut/);
  });

  test('handleRutChange NO llama a formatRut — setea el valor crudo', () => {
    // Despues del fix: setRut(e.target.value) sin formatRut()
    expect(content).not.toMatch(/formatRut\(e\.target\.value\)/);
    expect(content).toMatch(/setRut\(e\.target\.value\)/);
  });
});
