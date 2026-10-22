/**
 * PRD §9.3.16: quitar labels "Zofri" de UI en bodega.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'app/(app)/bodega/client_page.tsx',
  'components/BodegaCard.tsx',
];

describe('PRD §9.3.16 — labels Zofri reemplazados en bodega', () => {
  test.each(FILES)('%s NO contiene "Zofri"', (file) => {
    const content = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    expect(content).not.toMatch(/Zofri/);
  });

  test('bodega/client_page.tsx usa "Sistema" como label', () => {
    const content = fs.readFileSync(path.join(ROOT, 'app/(app)/bodega/client_page.tsx'), 'utf-8');
    expect(content).toMatch(/Sistema/);
  });
});
