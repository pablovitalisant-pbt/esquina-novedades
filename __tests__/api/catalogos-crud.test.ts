/**
 * Tests PBT-IA — BUG-011 Fase B: API CRUD de catálogos
 * Estado inicial: ROJO (app/api/catalogos/route.ts y [id]/route.ts no existen)
 *
 * Usa BD real (Neon). No mockea sql.
 *
 * GET  /api/catalogos — listar catálogos de la empresa
 * POST /api/catalogos — crear catálogo
 * PUT  /api/catalogos/[id] — editar (admin o dueño)
 * DELETE /api/catalogos/[id] — eliminar (admin o dueño)
 *
 * @jest-environment node
 */

// El entorno de test (.env.test → rama test-integration) se carga centralmente
// en jest.env-setup.ts (BUG-034). lib/db.ts ya tiene DATABASE_URL poblado.
const { sql } = require('@/lib/db');

// ── Mocks de autenticación ──────────────────────────────────────────
let mockSession: any = null;

jest.mock('next-auth', () => ({
  getServerSession: jest.fn().mockImplementation(() => Promise.resolve(mockSession)),
}));

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

// ── Fixture ──────────────────────────────────────────────────────────
const TEST_SLUG_A = `test-crud-a-${Date.now()}`;
const TEST_SLUG_B = `test-crud-b-${Date.now()}`;
let testAdminId: string;
let testNonAdminId: string;
let testEmpresaId: number;
let testCatalogoIdOwner: number;  // creado por testNonAdminId
let testCatalogoIdAdmin: number;  // creado por testAdminId
let GET: any;
let POST: any;
let PUT: any;
let DELETE_ROUTE: any;

beforeAll(async () => {
  // Obtener usuarios reales: un admin y un no-admin
  const admins = await sql`SELECT id FROM usuarios WHERE rol = 'admin' LIMIT 1`;
  if (admins.length === 0) throw new Error('No hay admin en la BD para tests');
  testAdminId = String(admins[0].id);

  const nonAdmins = await sql`SELECT id FROM usuarios WHERE rol != 'admin' LIMIT 1`;
  if (nonAdmins.length === 0) throw new Error('No hay usuario no-admin en la BD');
  testNonAdminId = String(nonAdmins[0].id);

  // Obtener empresa_id real
  const empresas = await sql`SELECT id FROM empresas LIMIT 1`;
  testEmpresaId = empresas[0].id;
});

afterAll(async () => {
  // Limpiar catálogos de test
  await sql`DELETE FROM catalogos WHERE slug IN (${TEST_SLUG_A}, ${TEST_SLUG_B})`;
});

// ── Helpers ──────────────────────────────────────────────────────────

function makeReq(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init);
}

// ─────────────────────────────────────────────────────────────────────
// GET /api/catalogos
// ─────────────────────────────────────────────────────────────────────

describe('GET /api/catalogos', () => {
  beforeAll(async () => {
    const mod = await import('@/app/api/catalogos/route');
    GET = mod.GET;
  });

  it('retorna 401 si no hay sesión', async () => {
    mockSession = null;
    const res = await GET(makeReq('/api/catalogos?empresa=1'));
    expect(res.status).toBe(401);
  });

  it('retorna 200 con array data para usuario autenticado', async () => {
    mockSession = { user: { id: testAdminId, rol: 'admin', empresas: [1] } };
    const res = await GET(makeReq('/api/catalogos?empresa=1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// POST /api/catalogos
// ─────────────────────────────────────────────────────────────────────

describe('POST /api/catalogos', () => {
  beforeAll(async () => {
    const mod = await import('@/app/api/catalogos/route');
    POST = mod.POST;
  });

  it('retorna 401 si no hay sesión', async () => {
    mockSession = null;
    const res = await POST(makeReq('/api/catalogos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: 'Test' }),
    }));
    expect(res.status).toBe(401);
  });

  it('retorna 400 si falta titulo', async () => {
    mockSession = { user: { id: testAdminId, rol: 'admin', empresas: [1] } };
    const res = await POST(makeReq('/api/catalogos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresaId: testEmpresaId }),
    }));
    expect(res.status).toBe(400);
  });

  it('crea catálogo con todos los campos y retorna 201', async () => {
    mockSession = { user: { id: testNonAdminId, rol: 'vendedor', empresas: [1] } };
    const res = await POST(makeReq('/api/catalogos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresaId: testEmpresaId,
        titulo: `Test CRUD A ${Date.now()}`,
        descripcion: null,
        mostrar_precio: true,
        margen_precio: 30,
        solo_stock: false,
        mostrar_stock: true,
        solo_nuevo: false,
        solo_nuevo_top_n: 1,
        palabras_incluir: 'vidrio,vaso',
        palabras_excluir: 'NAVIDAD',
        categoria: null,
      }),
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBeDefined();
    expect(body.user_id).toBe(Number(testNonAdminId));
    // Slice 4a: margen_precio del body se ignora (la columna queda en 0)
    expect(Number(body.margen_precio)).toBe(0);
    testCatalogoIdOwner = body.id;
  });

  it('genera slug a partir del título', async () => {
    mockSession = { user: { id: testAdminId, rol: 'admin', empresas: [1] } };
    const res = await POST(makeReq('/api/catalogos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresaId: testEmpresaId,
        titulo: 'Ofertas de Julio 2026',
        mostrar_precio: false,
        margen_precio: 0,
        solo_stock: true,
        mostrar_stock: false,
        solo_nuevo: false,
        solo_nuevo_top_n: 1,
        palabras_incluir: '',
        palabras_excluir: '',
      }),
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toMatch(/^ofertas-de-julio-2026/);
    testCatalogoIdAdmin = body.id;
  });
});

// ─────────────────────────────────────────────────────────────────────
// PUT /api/catalogos/[id]
// ─────────────────────────────────────────────────────────────────────

describe('PUT /api/catalogos/[id]', () => {
  beforeAll(async () => {
    const mod = await import('@/app/api/catalogos/[id]/route');
    PUT = mod.PUT;
  });

  it('retorna 401 si no hay sesión', async () => {
    mockSession = null;
    const res = await PUT(
      makeReq(`/api/catalogos/${testCatalogoIdOwner}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ margen_precio: 50 }),
      }),
      { params: Promise.resolve({ id: String(testCatalogoIdOwner) }) }
    );
    expect(res.status).toBe(401);
  });

  it('retorna 403 si el usuario no es admin ni dueño', async () => {
    // testCatalogoIdOwner fue creado por testNonAdminId
    // Usamos otro usuario no-admin que NO es el dueño
    const others = await sql`SELECT id FROM usuarios WHERE rol != 'admin' AND id != ${Number(testNonAdminId)} LIMIT 1`;
    if (others.length === 0) return; // skip: no hay otro no-admin
    mockSession = { user: { id: String(others[0].id), rol: 'vendedor', empresas: [1] } };
    const res = await PUT(
      makeReq(`/api/catalogos/${testCatalogoIdOwner}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ margen_precio: 50 }),
      }),
      { params: Promise.resolve({ id: String(testCatalogoIdOwner) }) }
    );
    expect(res.status).toBe(403);
  });

  it('admin puede editar catálogo de otro usuario', async () => {
    mockSession = { user: { id: testAdminId, rol: 'admin', empresas: [1] } };
    const res = await PUT(
      makeReq(`/api/catalogos/${testCatalogoIdOwner}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ margen_precio: 25 }),
      }),
      { params: Promise.resolve({ id: String(testCatalogoIdOwner) }) }
    );
    expect(res.status).toBe(200);
  });

  it('dueño puede editar su propio catálogo', async () => {
    mockSession = { user: { id: testNonAdminId, rol: 'vendedor', empresas: [1] } };
    const res = await PUT(
      makeReq(`/api/catalogos/${testCatalogoIdOwner}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ margen_precio: 40 }),
      }),
      { params: Promise.resolve({ id: String(testCatalogoIdOwner) }) }
    );
    expect(res.status).toBe(200);
  });

  it('margen_precio en el body del PUT no se persiste', async () => {
    mockSession = { user: { id: testAdminId, rol: 'admin', empresas: [1] } };
    const res = await PUT(
      makeReq(`/api/catalogos/${testCatalogoIdOwner}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ margen_precio: 77, palabras_excluir: 'NADA' }),
      }),
      { params: Promise.resolve({ id: String(testCatalogoIdOwner) }) }
    );
    expect(res.status).toBe(200);

    const [row] = await sql`
      SELECT margen_precio, palabras_excluir FROM catalogos WHERE id = ${testCatalogoIdOwner}
    `;
    expect(Number(row.margen_precio)).toBe(0);
    expect(row.palabras_excluir).toBe('NADA'); // el body sigue funcionando en sus otros campos
  });

  it('rechaza precio_override con precio <= 0', async () => {
    mockSession = { user: { id: testAdminId, rol: 'admin', empresas: [1] } };
    const res = await PUT(
      makeReq(`/api/catalogos/${testCatalogoIdOwner}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precio_overrides: [{ codigo: 'X', precio: 0 }] }),
      }),
      { params: Promise.resolve({ id: String(testCatalogoIdOwner) }) }
    );
    expect(res.status).toBe(400);
  });

  it('rechaza precio_override con codigo vacío', async () => {
    mockSession = { user: { id: testAdminId, rol: 'admin', empresas: [1] } };
    const res = await PUT(
      makeReq(`/api/catalogos/${testCatalogoIdOwner}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precio_overrides: [{ codigo: '', precio: 100 }] }),
      }),
      { params: Promise.resolve({ id: String(testCatalogoIdOwner) }) }
    );
    expect(res.status).toBe(400);
  });

  it('precio null borra el override', async () => {
    mockSession = { user: { id: testAdminId, rol: 'admin', empresas: [1] } };
    // Insertar override
    await sql`
      INSERT INTO catalogo_precio_override (catalogo_id, codigo, precio)
      VALUES (${testCatalogoIdOwner}, 'TO-DELETE-CRUD', 500)
      ON CONFLICT (catalogo_id, codigo) DO UPDATE SET precio = 500
    `;
    // Borrar vía PUT con precio null
    const res = await PUT(
      makeReq(`/api/catalogos/${testCatalogoIdOwner}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precio_overrides: [{ codigo: 'TO-DELETE-CRUD', precio: null }] }),
      }),
      { params: Promise.resolve({ id: String(testCatalogoIdOwner) }) }
    );
    expect(res.status).toBe(200);
    const remaining = await sql`
      SELECT codigo FROM catalogo_precio_override
      WHERE catalogo_id = ${testCatalogoIdOwner} AND codigo = 'TO-DELETE-CRUD'
    `;
    expect(remaining.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// DELETE /api/catalogos/[id]
// ─────────────────────────────────────────────────────────────────────

describe('DELETE /api/catalogos/[id]', () => {
  beforeAll(async () => {
    const mod = await import('@/app/api/catalogos/[id]/route');
    DELETE_ROUTE = mod.DELETE;
  });

  it('retorna 401 si no hay sesión', async () => {
    mockSession = null;
    const res = await DELETE_ROUTE(
      makeReq(`/api/catalogos/${testCatalogoIdAdmin}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: String(testCatalogoIdAdmin) }) }
    );
    expect(res.status).toBe(401);
  });

  it('retorna 403 si el usuario no es admin ni dueño', async () => {
    const others = await sql`SELECT id FROM usuarios WHERE rol != 'admin' AND id != ${Number(testNonAdminId)} LIMIT 1`;
    if (others.length === 0) return;
    mockSession = { user: { id: String(others[0].id), rol: 'vendedor', empresas: [1] } };
    const res = await DELETE_ROUTE(
      makeReq(`/api/catalogos/${testCatalogoIdOwner}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: String(testCatalogoIdOwner) }) }
    );
    expect(res.status).toBe(403);
  });

  it('admin puede eliminar catálogo de otro usuario', async () => {
    mockSession = { user: { id: testAdminId, rol: 'admin', empresas: [1] } };
    const res = await DELETE_ROUTE(
      makeReq(`/api/catalogos/${testCatalogoIdAdmin}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: String(testCatalogoIdAdmin) }) }
    );
    expect(res.status).toBe(200);
  });

  it('dueño puede eliminar su propio catálogo', async () => {
    mockSession = { user: { id: testNonAdminId, rol: 'vendedor', empresas: [1] } };
    const res = await DELETE_ROUTE(
      makeReq(`/api/catalogos/${testCatalogoIdOwner}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: String(testCatalogoIdOwner) }) }
    );
    expect(res.status).toBe(200);
  });
});

export {};
