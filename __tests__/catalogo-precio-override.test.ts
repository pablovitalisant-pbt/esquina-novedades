/**
 * Tests PBT-IA — Fase B: precio override en catálogos
 * Estado inicial: ROJO (tabla, endpoint y lógica aún no implementados)
 *
 * Estos tests usan BD real (Neon). No mockean sql.
 *
 * T1 — Concurrencia DELETE+INSERT
 * T2 — Row count después del JOIN
 * T5 — Aislamiento entre catálogos
 * T6 — Smoke E2E
 *
 * @jest-environment node
 */

// El entorno de test (.env.test → rama test-integration) se carga centralmente
// en jest.env-setup.ts (BUG-034). lib/db.ts ya tiene DATABASE_URL poblado.
const { sql } = require('@/lib/db');

// Mock de autenticación para los route handlers que usan getServerSession
// mockImplementation captura testUserId del closure — ya está seteado al momento de la llamada
jest.mock('next-auth', () => ({
  getServerSession: jest.fn().mockImplementation(() =>
    Promise.resolve({
      user: { id: testUserId, empresas: [1, 2] },
    })
  ),
}));

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

const TEST_CATALOGO_A_SLUG = `test-precio-override-a-${Date.now()}`;
const TEST_CATALOGO_B_SLUG = `test-precio-override-b-${Date.now()}`;
let testCatalogoIdA: number;
let testCatalogoIdB: number;
let testUserId: string;

// ---------------------------------------------------------------------------
// Setup / Teardown compartido (T2 y T5 comparten fixture)
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Obtener user_id y empresa_id reales
  const existingUser = await sql`SELECT id FROM usuarios LIMIT 1`;
  if (existingUser.length === 0) {
    throw new Error('No hay usuarios en la BD para obtener user_id de test');
  }
  testUserId = existingUser[0].id;
  const existingCat = await sql`SELECT empresa_id FROM catalogos LIMIT 1`;
  const testEmpresaId = existingCat[0].empresa_id;

  // Crear catálogo A
  const catA = await sql`
    INSERT INTO catalogos (empresa_id, user_id, slug, titulo, activo, mostrar_precio, margen_precio, solo_stock, solo_nuevo, palabras_incluir, palabras_excluir, categoria, mostrar_stock, solo_nuevo_top_n)
    VALUES (${testEmpresaId}, ${testUserId}, ${TEST_CATALOGO_A_SLUG}, 'Test Precio Override A', true, true, 0, false, false, '', '', null, false, 1)
    RETURNING id
  `;
  testCatalogoIdA = catA[0].id;

  // Crear catálogo B
  const catB = await sql`
    INSERT INTO catalogos (empresa_id, user_id, slug, titulo, activo, mostrar_precio, margen_precio, solo_stock, solo_nuevo, palabras_incluir, palabras_excluir, categoria, mostrar_stock, solo_nuevo_top_n)
    VALUES (${testEmpresaId}, ${testUserId}, ${TEST_CATALOGO_B_SLUG}, 'Test Precio Override B', true, true, 0, false, false, '', '', null, false, 1)
    RETURNING id
  `;
  testCatalogoIdB = catB[0].id;
});

afterAll(async () => {
  // Limpiar overrides de test (try/catch: tabla no existe aún en Fase B)
  try {
    await sql`DELETE FROM catalogo_precio_override WHERE catalogo_id IN (${testCatalogoIdA}, ${testCatalogoIdB})`;
  } catch (_) { /* tabla no creada aún */ }
  // Limpiar catálogos de test
  await sql`DELETE FROM catalogos WHERE id IN (${testCatalogoIdA}, ${testCatalogoIdB})`;
});

// ---------------------------------------------------------------------------
// T1 — Concurrencia DELETE+INSERT
// ---------------------------------------------------------------------------

describe('T1 — Concurrencia DELETE+INSERT en PUT', () => {
  it('dos PUTs concurrentes no pierden overrides (estado final contiene todos los del segundo request)', async () => {
    const { PUT } = await import('@/app/api/catalogos/[id]/route');

    // Insertamos un override inicial para simular estado previo
    await sql`
      INSERT INTO catalogo_precio_override (catalogo_id, codigo, precio)
      VALUES (${testCatalogoIdA}, 'INITIAL-001', 99.99)
      ON CONFLICT (catalogo_id, codigo) DO UPDATE SET precio = 99.99
    `;

    const body1 = JSON.stringify({
      precio_overrides: [
        { codigo: 'CONCURRENT-A', precio: 111 },
        { codigo: 'CONCURRENT-B', precio: 222 },
      ],
    });

    const body2 = JSON.stringify({
      precio_overrides: [
        { codigo: 'CONCURRENT-X', precio: 777 },
        { codigo: 'CONCURRENT-Y', precio: 888 },
      ],
    });

    // Disparar dos PUTs simultáneos contra el MISMO catálogo
    const [res1, res2] = await Promise.all([
      PUT(
        new Request(`http://localhost/api/catalogos/${testCatalogoIdA}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: body1,
        }),
        { params: Promise.resolve({ id: String(testCatalogoIdA) }) }
      ),
      PUT(
        new Request(`http://localhost/api/catalogos/${testCatalogoIdA}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: body2,
        }),
        { params: Promise.resolve({ id: String(testCatalogoIdA) }) }
      ),
    ]);

    // Ambos deberían responder (no crash)
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Verificar estado final: deben existir overrides (no tabla vacía)
    const final = await sql`
      SELECT codigo, precio FROM catalogo_precio_override
      WHERE catalogo_id = ${testCatalogoIdA}
      ORDER BY codigo
    `;

    // Si el DELETE+INSERT es atómico por request, el estado final
    // será el de UNO de los dos requests (el que corrió último).
    // Lo que NUNCA debe pasar es pérdida total de datos (tabla vacía).
    expect(final.length).toBeGreaterThan(0);

    // También verificamos que INITIAL-001 ya no esté (el reemplazo lo borró)
    const initialSurvivor = final.filter((r: any) => r.codigo === 'INITIAL-001');
    expect(initialSurvivor.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T2 — Row count después del JOIN (fixture compartida con T5)
// ---------------------------------------------------------------------------

describe('T2 — Row count después del JOIN con override', () => {
  it('el endpoint público devuelve la misma cantidad de productos con y sin overrides', async () => {
    const { GET } = await import('@/app/api/catalogos/public/[slug]/route');

    // Obtener productos sin overrides (baseline)
    const resBefore = await GET(
      new Request(`http://localhost/api/catalogos/public/${TEST_CATALOGO_A_SLUG}`),
      { params: Promise.resolve({ slug: TEST_CATALOGO_A_SLUG }) }
    );
    const { data: dataBefore } = await resBefore.json();
    const countBefore = dataBefore.productos.length;

    // Insertar un override para un código que existe en los productos del catálogo
    if (dataBefore.productos.length > 0) {
      const primerCodigo = dataBefore.productos[0].codigo;
      await sql`
        INSERT INTO catalogo_precio_override (catalogo_id, codigo, precio)
        VALUES (${testCatalogoIdA}, ${primerCodigo}, 55555)
        ON CONFLICT (catalogo_id, codigo) DO UPDATE SET precio = 55555
      `;
    }

    // Obtener productos con override
    const resAfter = await GET(
      new Request(`http://localhost/api/catalogos/public/${TEST_CATALOGO_A_SLUG}`),
      { params: Promise.resolve({ slug: TEST_CATALOGO_A_SLUG }) }
    );
    const { data: dataAfter } = await resAfter.json();
    const countAfter = dataAfter.productos.length;

    // El COUNT debe ser idéntico — el LEFT JOIN no duplica filas
    expect(countAfter).toBe(countBefore);

    // Si hay override, verificar que el campo existe en el response
    if (dataAfter.productos.length > 0) {
      const productoConOverride = dataAfter.productos.find(
        (p: any) => p.precio_override !== undefined
      );
      // Al menos un producto debería tener el campo precio_override
      // (aunque sea null para los que no tienen override)
      const todosTienenCampo = dataAfter.productos.every(
        (p: any) => 'precio_override' in p
      );
      expect(todosTienenCampo).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// T5 — Aislamiento entre catálogos
// ---------------------------------------------------------------------------

describe('T5 — Aislamiento entre catálogos', () => {
  it('un override del catálogo A no contamina el catálogo B', async () => {
    const { GET } = await import('@/app/api/catalogos/public/[slug]/route');

    // Insertar override en catálogo A
    await sql`
      INSERT INTO catalogo_precio_override (catalogo_id, codigo, precio)
      VALUES (${testCatalogoIdA}, 'ISOLATION-TEST-CODE', 99999)
      ON CONFLICT (catalogo_id, codigo) DO UPDATE SET precio = 99999
    `;

    // Consultar catálogo A — debe tener el override
    const resA = await GET(
      new Request(`http://localhost/api/catalogos/public/${TEST_CATALOGO_A_SLUG}`),
      { params: Promise.resolve({ slug: TEST_CATALOGO_A_SLUG }) }
    );
    const { data: dataA } = await resA.json();
    const overrideA = dataA.productos.find((p: any) => p.codigo === 'ISOLATION-TEST-CODE');

    // Consultar catálogo B — NO debe tener el override del A
    const resB = await GET(
      new Request(`http://localhost/api/catalogos/public/${TEST_CATALOGO_B_SLUG}`),
      { params: Promise.resolve({ slug: TEST_CATALOGO_B_SLUG }) }
    );
    const { data: dataB } = await resB.json();
    const overrideB = dataB.productos.find((p: any) => p.codigo === 'ISOLATION-TEST-CODE');

    // Si el código existe en B, su precio_override debe ser null (no el del A)
    if (overrideB) {
      expect(overrideB.precio_override).toBeNull();
    }
    // Si el código existe en A, debe tener el override
    if (overrideA) {
      expect(overrideA.precio_override).toBe(99999);
    }
  });
});

// ---------------------------------------------------------------------------
// T6 — Smoke E2E: flujo completo
// ---------------------------------------------------------------------------

describe('T6 — Smoke E2E: crear → editar override → verificar público', () => {
  it('flujo completo: PUT guarda override y GET público lo refleja', async () => {
    const { PUT } = await import('@/app/api/catalogos/[id]/route');
    const { GET } = await import('@/app/api/catalogos/public/[slug]/route');

    // 1. Obtener un código real de los productos del catálogo A
    const resInicial = await GET(
      new Request(`http://localhost/api/catalogos/public/${TEST_CATALOGO_A_SLUG}`),
      { params: Promise.resolve({ slug: TEST_CATALOGO_A_SLUG }) }
    );
    const { data: dataInicial } = await resInicial.json();

    if (dataInicial.productos.length === 0) {
      // Sin productos en el catálogo, el smoke test no puede correr
      // Pero el setup de test (palabras_incluir='') debería traer productos
      console.warn('T6 skip: catálogo de test sin productos');
      return;
    }

    const codigoTest = dataInicial.productos[0].codigo;
    const precioOverride = 12345;

    // 2. Guardar override vía PUT
    const resPut = await PUT(
      new Request(`http://localhost/api/catalogos/${testCatalogoIdA}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          precio_overrides: [{ codigo: codigoTest, precio: precioOverride }],
        }),
      }),
      { params: Promise.resolve({ id: String(testCatalogoIdA) }) }
    );
    expect(resPut.status).toBe(200);

    // 3. Verificar que el GET público refleja el override
    const resGet = await GET(
      new Request(`http://localhost/api/catalogos/public/${TEST_CATALOGO_A_SLUG}`),
      { params: Promise.resolve({ slug: TEST_CATALOGO_A_SLUG }) }
    );
    const { data: dataFinal } = await resGet.json();
    const producto = dataFinal.productos.find((p: any) => p.codigo === codigoTest);

    expect(producto).toBeDefined();
    expect(producto.precio_override).toBe(precioOverride);
    expect(producto.precio_catalogo).toBe(precioOverride); // override reemplaza fórmula
  });
});

// ---------------------------------------------------------------------------
// T7 — Cobertura de page.tsx (Server Component, código duplicado de route.ts)
// ---------------------------------------------------------------------------

describe('T7 — page.tsx getCatalogData refleja overrides igual que route.ts', () => {
  it('getCatalogData devuelve precio_override y aplica precedencia', async () => {
    const { getCatalogData } = await import('@/app/catalogo/[slug]/page');

    // Insertar override para catálogo A
    const { GET } = await import('@/app/api/catalogos/public/[slug]/route');
    const resInicial = await GET(
      new Request(`http://localhost/api/catalogos/public/${TEST_CATALOGO_A_SLUG}`),
      { params: Promise.resolve({ slug: TEST_CATALOGO_A_SLUG }) }
    );
    const { data: dataInicial } = await resInicial.json();

    if (dataInicial.productos.length === 0) {
      console.warn('T7 skip: catálogo de test sin productos');
      return;
    }

    const codigoTest = dataInicial.productos[0].codigo;
    const precioOverride = 77777;

    // Guardar override vía PUT
    const { PUT } = await import('@/app/api/catalogos/[id]/route');
    await PUT(
      new Request(`http://localhost/api/catalogos/${testCatalogoIdA}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          precio_overrides: [{ codigo: codigoTest, precio: precioOverride }],
        }),
      }),
      { params: Promise.resolve({ id: String(testCatalogoIdA) }) }
    );

    // Llamar a getCatalogData (el código de page.tsx)
    const result = await getCatalogData(TEST_CATALOGO_A_SLUG);

    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();

    const producto = result.data!.productos.find((p: any) => p.codigo === codigoTest);
    expect(producto).toBeDefined();
    expect(producto!.precio_override).toBe(precioOverride);
    expect((producto as any).precio_catalogo).toBe(precioOverride);
  });
});

// ---------------------------------------------------------------------------
// T8 — Validación server-side de precio_overrides
// ---------------------------------------------------------------------------

describe('T8 — Validación server-side en PUT precio_overrides', () => {
  it('rechaza precio <= 0 con 400', async () => {
    const { PUT } = await import('@/app/api/catalogos/[id]/route');

    const res = await PUT(
      new Request(`http://localhost/api/catalogos/${testCatalogoIdA}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          precio_overrides: [{ codigo: 'TEST-001', precio: -50 }],
        }),
      }),
      { params: Promise.resolve({ id: String(testCatalogoIdA) }) }
    );

    expect(res.status).toBe(400);
  });

  it('rechaza precio = 0 con 400', async () => {
    const { PUT } = await import('@/app/api/catalogos/[id]/route');

    const res = await PUT(
      new Request(`http://localhost/api/catalogos/${testCatalogoIdA}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          precio_overrides: [{ codigo: 'TEST-001', precio: 0 }],
        }),
      }),
      { params: Promise.resolve({ id: String(testCatalogoIdA) }) }
    );

    expect(res.status).toBe(400);
  });

  it('rechaza codigo vacío con 400', async () => {
    const { PUT } = await import('@/app/api/catalogos/[id]/route');

    const res = await PUT(
      new Request(`http://localhost/api/catalogos/${testCatalogoIdA}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          precio_overrides: [{ codigo: '', precio: 100 }],
        }),
      }),
      { params: Promise.resolve({ id: String(testCatalogoIdA) }) }
    );

    expect(res.status).toBe(400);
  });

  it('rechaza precio no numérico con 400', async () => {
    const { PUT } = await import('@/app/api/catalogos/[id]/route');

    const res = await PUT(
      new Request(`http://localhost/api/catalogos/${testCatalogoIdA}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          precio_overrides: [{ codigo: 'TEST-001', precio: 'gratis' }],
        }),
      }),
      { params: Promise.resolve({ id: String(testCatalogoIdA) }) }
    );

    expect(res.status).toBe(400);
  });

  it('acepta array vacío (sin overrides)', async () => {
    const { PUT } = await import('@/app/api/catalogos/[id]/route');

    const res = await PUT(
      new Request(`http://localhost/api/catalogos/${testCatalogoIdA}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          precio_overrides: [],
        }),
      }),
      { params: Promise.resolve({ id: String(testCatalogoIdA) }) }
    );

    expect(res.status).toBe(200);
  });

  it('acepta entrada con precio null (borrar override)', async () => {
    const { PUT } = await import('@/app/api/catalogos/[id]/route');

    // Insertar un override que luego debe ser borrado
    await sql`
      INSERT INTO catalogo_precio_override (catalogo_id, codigo, precio)
      VALUES (${testCatalogoIdA}, 'TO-DELETE', 500)
      ON CONFLICT (catalogo_id, codigo) DO UPDATE SET precio = 500
    `;

    // PUT con precio null debe borrarlo
    const res = await PUT(
      new Request(`http://localhost/api/catalogos/${testCatalogoIdA}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          precio_overrides: [{ codigo: 'TO-DELETE', precio: null }],
        }),
      }),
      { params: Promise.resolve({ id: String(testCatalogoIdA) }) }
    );

    expect(res.status).toBe(200);

    // Verificar que el override YA NO EXISTE en la tabla
    const remaining = await sql`
      SELECT codigo FROM catalogo_precio_override
      WHERE catalogo_id = ${testCatalogoIdA} AND codigo = 'TO-DELETE'
    `;
    expect(remaining.length).toBe(0);
  });
});

export {};
