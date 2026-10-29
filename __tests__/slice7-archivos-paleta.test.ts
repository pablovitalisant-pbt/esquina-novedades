/**
 * Slice 7 — todo archivo generado por la app usa la paleta de marca.
 * Estático: prohíbe hex/rgb/argb de la paleta vieja en los generadores.
 * Unitario: tokens y helpers puros de lib/empresa.
 */
import fs from 'node:fs';
import path from 'node:path';
import { EMPRESA, hexToRgb, hexToArgb } from '@/lib/empresa';

const RAIZ = path.join(__dirname, '..');

const GENERADORES = [
  'app/(app)/notas-venta/[id]/client_page.tsx',
  'app/(app)/caja-mayor/client_page.tsx',
  'app/(app)/catalogo/admin/client_page.tsx',
  'app/catalogo/[slug]/client_page.tsx',
  'app/globals.css',
  'hooks/useShareImage.ts',
  'app/api/share-image/route.ts',
  'app/(app)/admin/inversion-mercaderia/client_page.tsx',
];

// Paleta vieja (bazar-naty): rojos, naranjos, grises y pasteles ajenos a la marca.
const PROHIBIDOS = /#(?:E21E26|FFB612|231F20|F58220|FF9900|C9DAF8|D4A96E|E2EFDA|FCE4D6)\b|FF(?:E21E26|FFB612|FF9900|C9DAF8|D4A96E|E2EFDA|FCE4D6)\b|rgb\(\s*79\s*,\s*76\s*,\s*77\s*\)/i;

describe('slice 7 — paleta de marca en archivos generados', () => {
  it.each(GENERADORES)('%s no contiene colores de la paleta vieja', (rel) => {
    const src = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
    const match = src.match(PROHIBIDOS);
    expect(match?.[0] ?? null).toBeNull();
  });

  it('los generadores de PDF/Excel/QR referencian EMPRESA.colores', () => {
    for (const rel of [
      'app/(app)/notas-venta/[id]/client_page.tsx',
      'app/(app)/caja-mayor/client_page.tsx',
      'app/(app)/catalogo/admin/client_page.tsx',
    ]) {
      const src = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
      expect(src).toMatch(/EMPRESA\.colores\./);
    }
  });

  it('el modo impresión del catálogo usa tokens de marca, no negro fijo', () => {
    const css = fs.readFileSync(path.join(RAIZ, 'app/globals.css'), 'utf8');
    const print = css.slice(css.indexOf('@media print'), css.indexOf('@layer utilities'));
    expect(print).toMatch(/var\(--heading\)/);
    expect(print).toMatch(/var\(--border\)/);
  });
});

describe('slice 7 — tokens y helpers de archivo', () => {
  it('EMPRESA.colores trae los tokens de archivo', () => {
    expect(EMPRESA.colores).toMatchObject({
      primario: '#590078',
      acento: '#F2B936',
      tinta: '#21002F',
      fondoSuave: '#FFF8EA',
      champagne: '#FFE6A0',
      violetaSuave: '#F5EEF8',
      textoClaro: '#FFF8EA',
      borde: '#E4D8EA',
    });
  });

  it('hexToRgb convierte a tuplas de jsPDF', () => {
    expect(hexToRgb('#590078')).toEqual([89, 0, 120]);
    expect(hexToRgb('#F2B936')).toEqual([242, 185, 54]);
    expect(hexToRgb('#FFF8EA')).toEqual([255, 248, 234]);
  });

  it('hexToArgb agrega el alfa FF que exige exceljs', () => {
    expect(hexToArgb('#590078')).toBe('FF590078');
    expect(hexToArgb('#FFF8EA')).toBe('FFFFF8EA');
  });
});
