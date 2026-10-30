/**
 * @jest-environment node
 *
 * Fase B — pos4: inicio por rol tras login, "/" y middleware.
 * Riesgos: callbackUrl externo (open redirect), bodeguero nunca a /pos,
 * flag off sin cambios de comportamiento, manifest según flag.
 */
import fs from 'fs';
import path from 'path';
import { rutaCallbackSegura, rutaInicio } from '@/lib/ruta-inicio';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

const ON = { 'pos-v1': true };
const OFF = { 'pos-v1': false };

describe('rutaInicio', () => {
  test('flag ON: admin y vendedor a /pos, bodeguero a /bodega', () => {
    expect(rutaInicio('admin', ON)).toBe('/pos');
    expect(rutaInicio('vendedor', ON)).toBe('/pos');
    expect(rutaInicio('bodeguero', ON)).toBe('/bodega');
  });

  test('flag ON: bodeguero nunca a /pos, rol desconocido no gana /pos', () => {
    expect(rutaInicio('bodeguero', ON)).not.toBe('/pos');
    expect(rutaInicio('otro', ON)).toBe('/precios');
    expect(rutaInicio(null, ON)).toBe('/precios');
    expect(rutaInicio(undefined, ON)).toBe('/precios');
  });

  test('flag OFF: todos a /precios (comportamiento de hoy)', () => {
    for (const rol of ['admin', 'vendedor', 'bodeguero', 'otro', null]) {
      expect(rutaInicio(rol, OFF)).toBe('/precios');
    }
  });

  test('un valor no booleano del flag no enciende el POS', () => {
    expect(rutaInicio('admin', {} as Record<string, boolean>)).toBe('/precios');
  });
});

describe('rutaCallbackSegura (anti open redirect)', () => {
  test('acepta rutas internas', () => {
    expect(rutaCallbackSegura('/pos')).toBe('/pos');
    expect(rutaCallbackSegura('/notas-venta/12?x=1')).toBe('/notas-venta/12?x=1');
  });

  test('rechaza externas y protocol-relative', () => {
    expect(rutaCallbackSegura('https://evil.com')).toBeNull();
    expect(rutaCallbackSegura('//evil.com')).toBeNull();
    expect(rutaCallbackSegura('/\\evil.com')).toBeNull();
    expect(rutaCallbackSegura('javascript:alert(1)')).toBeNull();
    expect(rutaCallbackSegura('')).toBeNull();
    expect(rutaCallbackSegura(null)).toBeNull();
  });
});

describe('puntos de entrada usan rutaInicio', () => {
  test('login: respeta callbackUrl seguro y cae a rutaInicio', () => {
    const login = read('app/(auth)/login/page.tsx');
    expect(login).toMatch(/rutaCallbackSegura\(/);
    expect(login).toMatch(/rutaInicio\(/);
    expect(login).not.toMatch(/router\.push\('\/precios'\)/);
  });

  test('app/page.tsx redirige con rutaInicio, no fijo a /precios', () => {
    const page = read('app/page.tsx');
    expect(page).toMatch(/redirect\(rutaInicio\(/);
    expect(page).not.toMatch(/redirect\('\/precios'\)/);
  });

  test('middleware usa rutaInicio para el fallback de acceso', () => {
    const mw = read('middleware.ts');
    expect(mw).toMatch(/rutaInicio\(/);
  });
});

describe('manifest start_url según flag', () => {
  beforeEach(() => jest.resetModules());

  test('flag ON -> /pos', () => {
    jest.doMock('@/config/feature-flags.json', () => ({ 'pos-v1': true }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const manifest = require('@/app/manifest').default;
    expect(manifest().start_url).toBe('/pos');
  });

  test('flag OFF -> /precios', () => {
    jest.doMock('@/config/feature-flags.json', () => ({ 'pos-v1': false }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const manifest = require('@/app/manifest').default;
    expect(manifest().start_url).toBe('/precios');
  });
});
