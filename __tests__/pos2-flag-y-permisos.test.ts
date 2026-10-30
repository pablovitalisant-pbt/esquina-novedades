/**
 * Fase B — pos2: flag `pos-v1`, acceso por rol y API de productos reutilizada.
 */
import fs from 'fs';
import path from 'path';
import { RUTAS_POR_ROL } from '@/lib/rutas-por-rol';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

describe('pos2 — acceso', () => {
  test('/pos está permitido a admin y vendedor, nunca a bodeguero', () => {
    expect(RUTAS_POR_ROL.admin).toContain('/pos');
    expect(RUTAS_POR_ROL.vendedor).toContain('/pos');
    expect(RUTAS_POR_ROL.bodeguero).not.toContain('/pos');
  });

  test('page.tsx exige admin/vendedor y redirige con el flag apagado', () => {
    const page = read('app/(app)/pos/page.tsx');
    expect(page).toMatch(/pos-v1/);
    expect(page).toMatch(/redirect\('\/notas-venta'\)/);
    expect(page).toMatch(/rol !== 'admin'/);
    expect(page).toMatch(/'vendedor'/);
  });

  test('TopNav y BottomNav muestran el acceso solo con pos-v1', () => {
    for (const file of ['components/TopNav.tsx', 'components/BottomNav.tsx']) {
      const content = read(file);
      expect(content).toMatch(/\['pos-v1'\]/);
      expect(content).toMatch(/href="\/pos"|sheetLink\('\/pos'/);
    }
  });
});

describe('pos2 — API de productos reutilizada', () => {
  test('GET /api/productos lista sin término de búsqueda (grilla inicial)', () => {
    const api = read('app/api/productos/route.ts');
    expect(api).not.toMatch(/if \(!search\)\s*\{\s*return NextResponse\.json\(\{ data: \[\] \}\)/);
    expect(api).toMatch(/search\} = ''/);
  });

  test('GET /api/productos devuelve categoria para los chips', () => {
    expect(read('app/api/productos/route.ts')).toMatch(/MAX\(p\.categoria\) as categoria/);
  });
});
