/**
 * @jest-environment node
 *
 * Fase B — soft-delete: migracion + filtro `activo` en los listados.
 *
 * El filtro se verifica sobre el codigo fuente de cada query. No es lo ideal
 * (una ejecucion real contra DB seria mas fuerte) pero el punto de este slice
 * es NO OLVIDARSE de ninguna rama de listado, y eso es exactamente lo que un
 * scan por rama detecta. Mismo criterio que la nota de productos-crear-duplicado.
 */
import { readFileSync } from 'fs';
import path from 'path';

const raiz = path.resolve(__dirname, '..');
const leer = (rel: string) => readFileSync(path.join(raiz, rel), 'utf8');

// ── Migracion ───────────────────────────────────────────────────────
describe('migracion productos.activo', () => {
  let sqlText: string;

  beforeAll(() => {
    sqlText = leer('migrations/038_productos_activo.sql');
  });

  test('agrega la columna activo con DEFAULT true y NOT NULL', () => {
    const ddl = sqlText.toLowerCase();
    expect(ddl).toContain('alter table');
    expect(ddl).toContain('productos');
    expect(ddl).toContain('add column');
    expect(ddl).toContain('activo');
    expect(ddl).toContain('boolean');
    expect(ddl).toContain('not null');
    expect(ddl).toContain('default true');
  });

  test('es idempotente (IF NOT EXISTS) para poder re-aplicarse sin romper', () => {
    expect(sqlText.toLowerCase()).toContain('if not exists');
  });

  test('NO borra ni reescribe datos existentes', () => {
    const ddl = sqlText.toLowerCase();
    expect(ddl).not.toMatch(/\bdelete\s+from\b/);
    expect(ddl).not.toMatch(/\bdrop\s+column\b/);
    expect(ddl).not.toMatch(/\btruncate\b/);
  });
});

// ── Impacto lateral: cada listado debe filtrar activo ───────────────
describe('filtro activo en listados', () => {
  test('productos-lista: las 8 ramas filtran (incluidas las 2 sin WHERE previo)', () => {
    const src = leer('app/api/admin/productos-lista/route.ts');
    // 8 bloques de listado (4 escenarios x rows+count) deben llevar el filtro.
    const conFiltro = src.match(/activo\s*=\s*true/gi) ?? [];
    expect(conFiltro.length).toBeGreaterThanOrEqual(8);
  });

  test('productos-lista: la rama sin filtros previos ahora TIENE WHERE', () => {
    const src = leer('app/api/admin/productos-lista/route.ts');
    // Antes: "FROM public.productos p\n ORDER BY" sin WHERE. No debe quedar asi.
    expect(src).not.toMatch(/FROM public\.productos p\s*\n\s*ORDER BY/i);
  });

  test('productos (buscador general) filtra activo', () => {
    expect(leer('app/api/productos/route.ts')).toMatch(/activo\s*=\s*true/i);
  });

  test('alertas-stock filtra activo', () => {
    expect(leer('app/api/alertas-stock/route.ts')).toMatch(/activo\s*=\s*true/i);
  });

  test('alertas-stock/lista filtra activo', () => {
    expect(leer('app/api/alertas-stock/lista/route.ts')).toMatch(/activo\s*=\s*true/i);
  });

  test('catalogo publico (api) filtra activo en las ramas de listado', () => {
    expect(leer('app/api/catalogos/public/[slug]/route.ts')).toMatch(/activo\s*=\s*true/i);
  });

  test('catalogo publico (page) filtra activo en las ramas de listado', () => {
    expect(leer('app/catalogo/[slug]/data.ts')).toMatch(/activo\s*=\s*true/i);
  });

  test('landing (app/page.tsx) filtra activo', () => {
    expect(leer('app/page.tsx')).toMatch(/activo\s*=\s*true/i);
  });

  test('productos publicos (app/productos/page.tsx) filtra activo', () => {
    expect(leer('app/productos/page.tsx')).toMatch(/activo\s*=\s*true/i);
  });

  // El conteo online de total_productos NO vive en client_page.tsx (esa es la
  // rama offline eliminada en Slice 3):
  // vive en la page server-side y en el API de categorias.
  test('categorias admin (page server-side) cuenta solo activos', () => {
    expect(leer('app/(app)/admin/categorias/page.tsx')).toMatch(/p\.activo\s*=\s*true/i);
  });

  test('api/categorias GET cuenta solo activos', () => {
    expect(leer('app/api/categorias/route.ts')).toMatch(/p\.activo\s*=\s*true/i);
  });

  test('categorias: el filtro va en el ON del LEFT JOIN, no en el WHERE', () => {
    // En el WHERE convertiria el LEFT JOIN en INNER y las categorias sin
    // productos activos desaparecerian de la lista.
    for (const f of ['app/(app)/admin/categorias/page.tsx', 'app/api/categorias/route.ts']) {
      const src = leer(f);
      expect(src).toMatch(/LEFT JOIN productos p ON p\.categoria = c\.nombre AND p\.activo = true/i);
      expect(src).not.toMatch(/WHERE[^`]*p\.activo\s*=\s*true/i);
    }
  });

  // Ampliacion del contrato (2026-09-12): 3 archivos mas que listan productos.
  test('ubicaciones (bodega, rama online) filtra activo y conserva el LEFT JOIN', () => {
    const src = leer('app/api/ubicaciones/route.ts');
    expect(src).toMatch(/p\.activo\s*=\s*true/i);
    // el join con ubicaciones_bodega NO debe romperse al agregar el filtro
    expect(src).toMatch(/LEFT JOIN ubicaciones_bodega u ON u\.codigo = p\.codigo/i);
  });

  test('inversion-mercaderia filtra activo en la lectura de productos', () => {
    const src = leer('app/api/admin/inversion-mercaderia/route.ts');
    expect(src).toMatch(/activo\s*=\s*true/i);
  });

  test('inversion-mercaderia snapshot filtra activo', () => {
    const src = leer('app/api/admin/inversion-mercaderia/snapshot/route.ts');
    expect(src).toMatch(/activo\s*=\s*true/i);
  });

  test('inversion-mercaderia: ambos SELECT de productos (con y sin categoria) filtran', () => {
    const src = leer('app/api/admin/inversion-mercaderia/route.ts');
    const filtros = src.match(/activo\s*=\s*true/gi) ?? [];
    expect(filtros.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Exenciones documentadas (NO deben filtrar) ──────────────────────
describe('exenciones: archivos que deben seguir cubriendo activos e inactivos', () => {
  test('categorias/[id] NO filtra activo: debe reasignar a NULL tambien los inactivos', () => {
    const src = leer('app/api/categorias/[id]/route.ts');
    // Si esto filtrara, un producto eliminado quedaria con categoria apuntando
    // a una categoria borrada (dangling: no hay FK que lo proteja).
    expect(src).not.toMatch(/activo\s*=\s*true/i);
  });
});

// ── Impacto lateral: los lookups puntuales NO deben filtrar ─────────
describe('lookups puntuales no filtran activo (deben seguir operando)', () => {
  test('PUT /api/productos/[id] sigue operando sobre producto inactivo', () => {
    const src = leer('app/api/productos/[id]/route.ts');
    expect(src).not.toMatch(/activo\s*=\s*true/i);
  });

  test('cambiar-codigo sigue operando sobre producto inactivo', () => {
    const src = leer('app/api/productos/[id]/cambiar-codigo/route.ts');
    expect(src).not.toMatch(/activo\s*=\s*true/i);
  });

  test('eliminar (el propio endpoint) lee el activo actual, no lo filtra', () => {
    const src = leer('app/api/productos/[id]/eliminar/route.ts');
    expect(src).toMatch(/activo/);
    expect(src).not.toMatch(/where[^`]*activo\s*=\s*true/i);
  });
});
