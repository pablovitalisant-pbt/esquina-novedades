/**
 * Slice 4a — Fase B: el precio del catálogo es prcventa (o el override).
 * BD real (Neon test-integration). Sin mocks de sql.
 *
 * T1 — producto sin override → prcventa, aunque el catálogo tenga margen_precio 50
 * T2 — override → mismo número en página (data.ts) y API pública
 *
 * @jest-environment node
 */
const { sql } = require('@/lib/db');

const SLUG = `test-slice4a-precio-${Date.now()}`;
const CODIGO = `SLICE4A-${Date.now()}`;
let catalogoId: number;
let empresaId: number;

beforeAll(async () => {
  const existingUser = await sql`SELECT id FROM usuarios LIMIT 1`;
  if (existingUser.length === 0) throw new Error('No hay usuarios en la BD para el test');
  const userId = existingUser[0].id;

  const empresas = await sql`SELECT id FROM empresas LIMIT 1`;
  if (empresas.length === 0) throw new Error('No hay empresas en la BD para el test');
  empresaId = empresas[0].id;

  // Fixture: prcventa 7777, costo 100 → la vieja fórmula daría 150 (margen 50)
  await sql`
    INSERT INTO productos (empresa_id, codigo, detalle, prcventa, costo, cif, margen_pct, saldo,
      umed, cantcaja, pesocaja, cubicaja, es_nuevo, prcminimo, categoria, stock_minimo,
      precio_mayor, minimo_mayor, activo)
    VALUES (${empresaId}, ${CODIGO}, 'Producto Slice 4a', 7777, 100, 0, 0, 10,
      'U', 1, 0, 0, true, null, null, null, null, null, true)
  `;

  const cat = await sql`
    INSERT INTO catalogos (empresa_id, user_id, slug, titulo, activo, mostrar_precio, margen_precio,
      solo_stock, solo_nuevo, palabras_incluir, palabras_excluir, categoria, mostrar_stock, solo_nuevo_top_n)
    VALUES (${empresaId}, ${userId}, ${SLUG}, 'Test Slice 4a precio', true, true, 50,
      false, false, '', '', null, false, 1)
    RETURNING id
  `;
  catalogoId = cat[0].id;
});

afterAll(async () => {
  await sql`DELETE FROM catalogo_precio_override WHERE catalogo_id = ${catalogoId}`;
  await sql`DELETE FROM catalogos WHERE id = ${catalogoId}`;
  await sql`DELETE FROM productos WHERE empresa_id = ${empresaId} AND codigo = ${CODIGO}`;
});

async function preciosReales(codigo: string) {
  const rows = await sql`
    SELECT MAX(prcventa)::float AS prcventa, MAX(costo)::float AS costo
    FROM productos
    WHERE empresa_id = ${empresaId} AND activo = true AND codigo = ${codigo}
    GROUP BY codigo
  `;
  return rows[0];
}

describe('Slice 4a — precio de catálogo = prcventa / override', () => {
  it('sin override: página y API pública devuelven prcventa, no costo + margen', async () => {
    const { getCatalogData } = await import('@/app/catalogo/[slug]/data');
    const { GET } = await import('@/app/api/catalogos/public/[slug]/route');

    const res = await GET(
      new Request(`http://localhost/api/catalogos/public/${SLUG}`),
      { params: Promise.resolve({ slug: SLUG }) },
    );
    const { data } = await res.json();
    expect(data.productos.length).toBeGreaterThan(0);

    const producto = data.productos.find((p: { codigo: string }) => p.codigo === CODIGO);
    expect(producto).toBeDefined();
    const real = await preciosReales(CODIGO);
    const esperado = Math.round(real.prcventa);

    expect(producto.precio_catalogo).toBe(esperado);
    expect(producto.precio_catalogo).not.toBe(Math.ceil(real.costo * 1.5));

    const pagina = await getCatalogData(SLUG);
    const enPagina = pagina.data!.productos.find((p) => p.codigo === CODIGO);
    expect(enPagina!.precio_catalogo).toBe(esperado);
  });

  it('con override: página y API pública usan el mismo número', async () => {
    const { getCatalogData } = await import('@/app/catalogo/[slug]/data');
    const { GET } = await import('@/app/api/catalogos/public/[slug]/route');

    const res = await GET(
      new Request(`http://localhost/api/catalogos/public/${SLUG}`),
      { params: Promise.resolve({ slug: SLUG }) },
    );
    const { data } = await res.json();
    const codigo = CODIGO;
    expect(data.productos.some((p: { codigo: string }) => p.codigo === CODIGO)).toBe(true);

    await sql`
      INSERT INTO catalogo_precio_override (catalogo_id, codigo, precio)
      VALUES (${catalogoId}, ${codigo}, 43210)
      ON CONFLICT (catalogo_id, codigo) DO UPDATE SET precio = 43210
    `;

    const resApi = await GET(
      new Request(`http://localhost/api/catalogos/public/${SLUG}`),
      { params: Promise.resolve({ slug: SLUG }) },
    );
    const api = (await resApi.json()).data.productos.find((p: { codigo: string }) => p.codigo === codigo);
    const pagina = (await getCatalogData(SLUG)).data!.productos.find((p) => p.codigo === codigo);

    expect(api.precio_catalogo).toBe(43210);
    expect(pagina!.precio_catalogo).toBe(43210);
  });
});
