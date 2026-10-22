import fs from 'fs';
import path from 'path';
import { EMPRESA } from '@/lib/empresa';

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['app', 'components', 'lib', 'contexts', 'hooks', 'utils'];
const BAD = /bazar[ -]?naty|bermejo|tarija|bolivia|logo-(texto|completo|icono|nota-venta)\.png/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|json)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('Slice 1: rebranding Chile', () => {
  const files = [
    ...DIRS.filter((d) => fs.existsSync(path.join(ROOT, d))).flatMap((d) => walk(path.join(ROOT, d))),
    path.join(ROOT, 'public', 'manifest.json'),
  ];

  test('ningún archivo de producción menciona Bazar Naty/Bolivia/logos viejos', () => {
    const hits = files.filter((f) => BAD.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(ROOT, f));
    expect(hits).toEqual([]);
  });

  test('sin es-BO ni "Documento de identidad"', () => {
    const hits = files
      .filter((f) => /es-BO|Documento de identidad/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(ROOT, f));
    expect(hits).toEqual([]);
  });

  test('constante EMPRESA', () => {
    expect(EMPRESA.slug).toBe('la-esquina-de-las-novedades');
    expect(EMPRESA.whatsappUrl).toBe('https://wa.me/56973409133');
  });
});
