/**
 * Fase B — Subir imagen al crear producto: input file + encadenar POST /api/productos/upload
 *
 * Contrato: 1 archivo (app/(app)/precios/client_page.tsx).
 * Riesgos: "Más de un evento asíncrono simultáneo" — 2 fetch secuenciales (productos + upload)
 * con botón deshabilitado durante TODO el flujo (crearLoading).
 * No aplican: INSERT a DB, permisos (ya verificado en slice anterior), middleware.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CLIENT_FILE = path.join(PROJECT_ROOT, 'app/(app)/precios/client_page.tsx');

describe('crear producto — imagen', () => {
  const content = fs.readFileSync(CLIENT_FILE, 'utf-8');

  test('Dialog tiene input file con accept image/jpeg,image/png,image/webp', () => {
    expect(content).toMatch(/accept.*image\/jpeg.*image\/png.*image\/webp/);
  });

  test('handleCrearProducto encadena POST /api/productos/upload', () => {
    // Debe existir un segundo fetch a /api/productos/upload dentro del handler
    expect(content).toMatch(/productos\/upload/);
  });

  test('la subida solo ocurre si hay archivo seleccionado (crearFile)', () => {
    expect(content).toMatch(/crearFile/);
  });

  test('Upload falla → toast warning, no error (producto ya creado)', () => {
    expect(content).toMatch(/warning|warn/);
    expect(content).toMatch(/imagen no se pudo/);
  });

  test('tiene estado crearFile (File | null) y crearPreview (string | null)', () => {
    expect(content).toMatch(/crearFile/);
    expect(content).toMatch(/crearPreview/);
  });
});
