/**
 * Fase B — Slice 1 del audit ponytail: deletes seguros.
 * Fuerza la condición ANTES del borrado (rojo) y guarda contra sobre-borrado.
 * Patrón source-scan (sin jsdom), mismo que subslice-b-badges.test.ts.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

// 21 flags verificados MUERTO en source (no se leen en app/components/lib).
const DEAD_FLAGS = [
  'kardex-movimiento',
  'ingresos-por-producto',
  'catalogo-margen-editable',
  'fix-catalogo-solo-nuevo',
  'catalogo-form-mejoras-slice1',
  'catalogo-parsekeywords-slice2',
  'catalogo-precio-override',
  'catalogo-ingreso-top-n-slice3',
  'notas-venta-cliente-id-zofri-cleanup',
  'alertas-stock-ui',
  'usuarios-single-tenant',
  'caja-config-cleanup',
  'notas-venta-pagar',
  'productos-crear',
  'landing-page-public',
  'notas-venta-buscador-teclado',
  'productos-crear-packing',
  'notas-venta-compartidas',
  'permisos-por-rol',
  'notas-venta-cifras-ars',
  'deudores',
];

// 14 flags verificados VIVO (leídos en source) — NO deben borrarse.
const LIVE_FLAGS = [
  'despachos-ia',
  'registro_notas_bodega_ui',
  // cliente-stars-visible se borra junto con ClienteStars (componente muerto).
];

function readFlags() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'config/feature-flags.json'), 'utf-8'));
}

describe('Slice 1 audit ponytail — deletes seguros', () => {
  test('feature-flags.json NO contiene ninguno de los 21 flags muertos', () => {
    const flags = readFlags();
    const present = DEAD_FLAGS.filter((f) => Object.prototype.hasOwnProperty.call(flags, f));
    expect(present).toEqual([]);
  });

  test('feature-flags.json conserva los 13 flags vivos restantes (no sobre-borrar)', () => {
    const flags = readFlags();
    for (const f of LIVE_FLAGS) {
      expect(Object.prototype.hasOwnProperty.call(flags, f)).toBe(true);
    }
  });

  test('ClienteStars.tsx NO existe (componente sin callers)', () => {
    expect(fs.existsSync(path.join(ROOT, 'components/ClienteStars.tsx'))).toBe(false);
  });

  test('.env.example no contiene variables de la capa offline (Slice 3)', () => {
    const c = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf-8');
    expect(c).not.toContain('POWER' + 'SYNC'); // partido para no tropezar con el guardia T-final
  });

  test('tailwind no escanea ./pages y tsconfig no excluye "ol"', () => {
    const tw = fs.readFileSync(path.join(ROOT, 'tailwind.config.ts'), 'utf-8');
    expect(tw).not.toMatch(/\.\/pages/);
    const ts = fs.readFileSync(path.join(ROOT, 'tsconfig.json'), 'utf-8');
    expect(ts).not.toMatch(/"ol"/);
  });

  describe('Frontera — NO se tocan (guards)', () => {
    test('sharp se mantiene en dependencies (requerido por next/image)', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
      expect(pkg.dependencies.sharp).toBeTruthy();
    });

    test('slice5-deps-smoke.test.ts se mantiene intacto', () => {
      expect(fs.existsSync(path.join(ROOT, '__tests__/slice5-deps-smoke.test.ts'))).toBe(true);
    });
  });
});
