/**
 * Fase B — equivalencia catálogo público: data.ts (page) y GET /api/catalogos/public/[slug]
 * devuelven los mismos códigos en el mismo orden, con precio_catalogo, precio_mayor
 * y minimo_mayor. BD real (Neon test-integration).
 *
 * @jest-environment node
 */
const { sql } = require('@/lib/db');

const SLUG = `test-equivalencia-${Date.now()}`;
const EMPRESA_SLUG = `test-equivalencia-emp-${Date.now()}`;
const PREFIJO = `EQ-${Date.now()}`;
let catalogoId: number;
let empresaId: number;

type ProductoPublico = {
  codigo: string;
  precio_catalogo: number | null;
  precio_mayor: number | null;
  minimo_mayor: number | null;
};

beforeAll(async () => {
  const existingUser = await sql`SELECT id FROM usuarios LIMIT 1`;
  if (existingUser.length === 0) throw new Error('No hay usuarios en la BD para el test');
  const userId = existingUser[0].id;

  const empresas = await sql`
    INSERT INTO empresas (nombre, slug) VALUES ('Test equivalencia', ${EMPRESA_SLUG}) RETURNING id
  `;
  empresaId = empresas[0].id;

  // Insertados en orden no alfabético: el catálogo deba ordenar por codigo.
  await sql`
    INSERT INTO productos (empresa_id, codigo, detalle, prcventa, costo, cif, margen_pct, saldo,
      umed, cantcaja, pesocaja, cubicaja, es_nuevo, prcminimo, categoria, stock_minimo,
      precio_mayor, minimo_mayor, activo)
    VALUES
      (${empresaId}, ${PREFIJO + '-C'}, 'Equivalencia C', 3000, 100, 0, 0, 10, 'U', 1, 0, 0, false, null, null, null, 2500, 6, true),
      (${empresaId}, ${PREFIJO + '-A'}, 'Equivalencia A', 1000, 100, 0, 0, 10, 'U', 1, 0, 0, false, null, null, null, 800, 3, true),
      (${empresaId}, ${PREFIJO + '-B'}, 'Equivalencia B', 2000, 100, 0, 0, 10, 'U', 1, 0, 0, false, null, null, null, null, null, true)
  `;

  const cat = await sql`
    INSERT INTO catalogos (empresa_id, user_id, slug, titulo, activo, mostrar_precio, margen_precio,
      solo_stock, solo_nuevo, palabras_incluir, palabras_excluir, categoria, mostrar_stock, solo_nuevo_top_n)
    VALUES (${empresaId}, ${userId}, ${SLUG}, 'Test equivalencia', true, true, 50,
      false, false, '', '', null, false, 1)
    RETURNING id
  `;
  catalogoId = cat[0].id;

  await sql`
    INSERT INTO catalogo_precio_override (catalogo_id, codigo, precio)
    VALUES (${catalogoId}, ${PREFIJO + '-B'}, 1234)
  `;
});

afterAll(async () => {
  await sql`DELETE FROM catalogo_precio_override WHERE catalogo_id = ${catalogoId}`;
  await sql`DELETE FROM catalogos WHERE id = ${catalogoId}`;
  await sql`DELETE FROM productos WHERE empresa_id = ${empresaId} AND codigo LIKE ${PREFIJO + '%'}`;
  await sql`DELETE FROM empresas WHERE id = ${empresaId}`;
});

const proyectar = (productos: ProductoPublico[]) => productos.map((p) => ({
  codigo: p.codigo,
  precio_catalogo: p.precio_catalogo,
  precio_mayor: p.precio_mayor,
  minimo_mayor: p.minimo_mayor,
}));

test('data.ts y GET público devuelven los mismos códigos, orden y precios', async () => {
  const { getCatalogData } = await import('@/app/catalogo/[slug]/data');
  const { GET } = await import('@/app/api/catalogos/public/[slug]/route');

  const pagina = await getCatalogData(SLUG);
  expect(pagina.status).toBe(200);

  const res = await GET(
    new Request(`http://localhost/api/catalogos/public/${SLUG}`),
    { params: Promise.resolve({ slug: SLUG }) },
  );
  expect(res.status).toBe(200);
  const { data } = (await res.json()) as { data: { productos: ProductoPublico[] } };

  const propios = pagina.data!.productos.filter((p) =>
    p.codigo.startsWith(PREFIJO));
  const api = data.productos.filter((p) => p.codigo.startsWith(PREFIJO));

  expect(proyectar(propios)).toEqual(proyectar(api));
  expect(propios.map((p) => p.codigo)).toEqual([
    PREFIJO + '-A', PREFIJO + '-B', PREFIJO + '-C',
  ]);

  // El costo nunca debe viajar al navegador (payload RSC / API pública).
  for (const p of [...propios, ...api]) {
    expect('costo' in p).toBe(false);
  }
});

export {};
