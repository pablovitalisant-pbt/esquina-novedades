/**
 * Fase B — Sub-slice C (#7): eliminar spell-checker externo + unificar nav config.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('9.21 — spell-checker externo eliminado', () => {
  test('spell-checker.tsx ya no existe', () => {
    expect(fs.existsSync(path.join(ROOT, 'components/ui/spell-checker.tsx'))).toBe(false);
  });

  test('input.tsx NO importa SpellCheckedInput', () => {
    const content = fs.readFileSync(path.join(ROOT, 'components/ui/input.tsx'), 'utf-8');
    expect(content).not.toMatch(/SpellCheckedInput|spell-checker/);
  });

  test('input.tsx usa spellCheck nativo en vez de componente externo', () => {
    const content = fs.readFileSync(path.join(ROOT, 'components/ui/input.tsx'), 'utf-8');
    // Debe usar spellCheck={true} o spellCheck nativo, no llamar a API externa
    expect(content).toMatch(/spellCheck/);
  });
});

// 9.22 (nav config compartida) diferido — alto riesgo de romper navegación
// en desktop + mobile para ~150 líneas de ahorro. Ver PRD §9.22.
