/**
 * Punto 5 — Test de integración real: duplicado de código en POST /api/productos.
 *
 * El 409 ya está implementado en app/api/productos/route.ts (chequeo SELECT por
 * (empresa_id, codigo)). Este test lo custodia contra regresión con DB real,
 * cerrando el hueco documentado en el PRD (detección de duplicado solo probada
 * por regex sobre el fuente, no por ejecución real contra DB).
 *
 * Usa BD real (Neon, rama test-integration vía .env.test — guard BUG-034).
 * No mockea sql.
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
// Código único por corrida. El happy-path lo crea (201) y el test de duplicado
// lo reenvía para forzar el 409. afterAll limpia el fixture.
const TEST_CODIGO = `TEST-DUP-${Date.now()}`;
let testEmpresaId: number;
let POST: any;

function makeReq(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init);
}

beforeAll(async () => {
  // Empresa real contra la que inserta el handler (user.empresas?.[0] ?? 1).
  const empresas = await sql`SELECT id FROM empresas LIMIT 1`;
  if (empresas.length === 0) throw new Error('No hay empresas en la BD para tests');
  testEmpresaId = empresas[0].id;

  const mod = await import('@/app/api/productos/route');
  POST = mod.POST;
});

afterAll(async () => {
  // Limpiar el fixture creado por el happy-path, si llegó a insertarse.
  await sql`DELETE FROM productos WHERE codigo = ${TEST_CODIGO}`;
});

describe('POST /api/productos — duplicado de código (409)', () => {
  it('retorna 401 si no hay sesión', async () => {
    mockSession = null;
    const res = await POST(makeReq('/api/productos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: TEST_CODIGO, detalle: 'Test', costo: 10, margen_pct: 30 }),
    }));
    expect(res.status).toBe(401);
  });

  it('crea un producto nuevo y retorna 201 (establece el fixture)', async () => {
    mockSession = { user: { id: 'test-admin', rol: 'admin', empresas: [testEmpresaId] } };
    const res = await POST(makeReq('/api/productos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: TEST_CODIGO, detalle: 'Producto test duplicado', costo: 10, margen_pct: 30 }),
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.codigo).toBe(TEST_CODIGO);
  });

  it('retorna 409 con error exacto si el código ya existe (misma empresa)', async () => {
    mockSession = { user: { id: 'test-admin', rol: 'admin', empresas: [testEmpresaId] } };
    const res = await POST(makeReq('/api/productos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: TEST_CODIGO, detalle: 'Producto test duplicado', costo: 10, margen_pct: 30 }),
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe(`Ya existe un producto con el código ${TEST_CODIGO}`);
  });
});

export {};
