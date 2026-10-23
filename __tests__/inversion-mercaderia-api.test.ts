/**
 * @jest-environment node
 *
 * FASE B — Slice "Informe de Inversión en Mercadería".
 * Tests del endpoint GET /api/admin/inversion-mercaderia.
 *
 * Riesgos forzados:
 *  - acceso SOLO rol admin (dato financiero, más restrictivo que /admin/categorias)
 *  - fecha ausente o igual a hoy → cálculo en vivo sobre productos
 *  - fecha pasada CON snapshot → devuelve lo almacenado verbatim
 *  - fecha pasada SIN snapshot → { sinSnapshot: true }, NUNCA inventa ceros
 *  - fecha inválida → 400; fecha futura → tratada como hoy
 *  - shape de respuesta según contrato
 *  - GAP de contrato: categoria + fecha pasada (snapshot sin columna categoria)
 *
 * La ruta app/api/admin/inversion-mercaderia/route.ts NO existe aún → rojo
 * hasta Fase C. Mismo estilo de mock que admin-productos-lista.test.ts.
 */

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sql(...args),
}));

const PRODUCTOS_LIVE = [
  { codigo: 'A-1023', detalle: 'Producto X', saldo: 40, costo: 12.5, prcventa: 18 },
  { codigo: 'LEGACY-1', detalle: 'Legacy', saldo: 9, costo: null, prcventa: null },
];

const SNAPSHOT_ROW = {
  id: 7, empresa_id: 1, fecha: '2026-08-19',
  costo_total: '1834200.50', venta_potencial_total: '2410800.00', ganancia_proyectada: '576599.50',
  productos_sin_costo: 3,
};

const SNAPSHOT_DETALLE = [
  { codigo: 'A-1023', detalle: 'Producto X', saldo: 40, costo: 12.5, prcventa: 18, costo_total: 500, venta_potencial: 720 },
];

describe('GET /api/admin/inversion-mercaderia — permisos', () => {
  let GET: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/admin/inversion-mercaderia/route');
    GET = mod.GET;
  });

  beforeEach(() => {
    getServerSession.mockClear();
    sql.mockClear();
  });

  test('1 — sin sesión → 401', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/admin/inversion-mercaderia'));
    expect(res.status).toBe(401);
  });

  test('2 — rol vendedor → 401 (más restrictivo que /admin/categorias)', async () => {
    getServerSession.mockResolvedValue({ user: { id: 2, rol: 'vendedor', empresas: [1] } });
    const res = await GET(new Request('http://localhost/api/admin/inversion-mercaderia'));
    expect(res.status).toBe(401);
  });

  test('3 — rol admin → acceso', async () => {
    getServerSession.mockResolvedValue({ user: { id: 1, rol: 'admin', empresas: [1] } });
    sql.mockResolvedValue(PRODUCTOS_LIVE);
    const res = await GET(new Request('http://localhost/api/admin/inversion-mercaderia'));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/admin/inversion-mercaderia — cálculo en vivo', () => {
  let GET: (req: Request) => Promise<Response>;
  const ADMIN = { user: { id: 1, rol: 'admin', empresas: [1] } };

  beforeAll(async () => {
    const mod = await import('@/app/api/admin/inversion-mercaderia/route');
    GET = mod.GET;
  });

  beforeEach(() => {
    getServerSession.mockReset();
    getServerSession.mockResolvedValue(ADMIN);
    sql.mockReset();
  });

  test('4 — fecha ausente → calcula en vivo sobre productos (usa calcularInversion)', async () => {
    sql.mockResolvedValue(PRODUCTOS_LIVE);
    const res = await GET(new Request('http://localhost/api/admin/inversion-mercaderia'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sinSnapshot).toBeUndefined();
    // legacy (costo NULL) excluido: 40*12.5 = 500
    expect(body.resumen.costoTotal).toBe(500);
    expect(body.resumen.productosSinCosto).toBe(1);
    expect(body.detalle).toHaveLength(2);
  });

  test('5 — fecha igual a hoy → calcula en vivo', async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    sql.mockResolvedValue(PRODUCTOS_LIVE);
    const res = await GET(new Request(`http://localhost/api/admin/inversion-mercaderia?fecha=${hoy}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sinSnapshot).toBeUndefined();
  });

  test('6 — fecha futura → tratada como hoy (no hay snapshot futuro)', async () => {
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    sql.mockResolvedValue(PRODUCTOS_LIVE);
    const res = await GET(new Request(`http://localhost/api/admin/inversion-mercaderia?fecha=${manana}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sinSnapshot).toBeUndefined();
  });

  test('7 — fecha inválida → 400', async () => {
    const res = await GET(new Request('http://localhost/api/admin/inversion-mercaderia?fecha=abc'));
    expect(res.status).toBe(400);
  });

  test('8 — shape de respuesta según contrato', async () => {
    sql.mockResolvedValue([{ codigo: 'A-1023', detalle: 'X', saldo: 40, costo: 12.5, prcventa: 18 }]);
    const res = await GET(new Request('http://localhost/api/admin/inversion-mercaderia'));
    const body = await res.json();
    expect(body).toHaveProperty('resumen');
    expect(body.resumen).toHaveProperty('costoTotal');
    expect(body.resumen).toHaveProperty('ventaPotencialTotal');
    expect(body.resumen).toHaveProperty('gananciaProyectada');
    expect(body.resumen).toHaveProperty('productosSinCosto');
    expect(Array.isArray(body.detalle)).toBe(true);
    expect(body.detalle[0]).toHaveProperty('costoTotal');
    expect(body.detalle[0]).toHaveProperty('ventaPotencial');
    expect(body.detalle[0]).toHaveProperty('ganancia');
  });
});

describe('GET /api/admin/inversion-mercaderia — snapshot fecha pasada', () => {
  let GET: (req: Request) => Promise<Response>;
  const ADMIN = { user: { id: 1, rol: 'admin', empresas: [1] } };

  beforeAll(async () => {
    const mod = await import('@/app/api/admin/inversion-mercaderia/route');
    GET = mod.GET;
  });

  beforeEach(() => {
    getServerSession.mockReset();
    getServerSession.mockResolvedValue(ADMIN);
    sql.mockReset();
  });

  test('9 — fecha pasada CON snapshot → devuelve los totales almacenados verbatim', async () => {
    sql
      .mockResolvedValueOnce([SNAPSHOT_ROW])
      .mockResolvedValueOnce(SNAPSHOT_DETALLE);
    const res = await GET(new Request('http://localhost/api/admin/inversion-mercaderia?fecha=2026-08-19'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sinSnapshot).toBeUndefined();
    expect(body.resumen.costoTotal).toBe(1834200.5);
    expect(body.resumen.ventaPotencialTotal).toBe(2410800.0);
    expect(body.resumen.gananciaProyectada).toBe(576599.5);
    expect(body.resumen.productosSinCosto).toBe(3);
    expect(body.detalle[0].codigo).toBe('A-1023');
  });

  test('10 — fecha pasada SIN snapshot → { sinSnapshot: true }, no inventa valores', async () => {
    sql.mockResolvedValueOnce([]); // SELECT snapshot no devuelve fila
    const res = await GET(new Request('http://localhost/api/admin/inversion-mercaderia?fecha=2026-08-01'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sinSnapshot).toBe(true);
    // La UI muestra "no hay snapshot para esa fecha" — no debe fabricar resumen ni detalle.
    expect(body.resumen).toBeUndefined();
    expect(body.detalle).toBeUndefined();
  });

  test('11 — fecha pasada (anterior a la activación del slice) → sinSnapshot', async () => {
    sql.mockResolvedValueOnce([]);
    const res = await GET(new Request('http://localhost/api/admin/inversion-mercaderia?fecha=2020-01-01'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sinSnapshot).toBe(true);
  });
});

describe('GET /api/admin/inversion-mercaderia — GAP de contrato: categoria + fecha pasada', () => {
  let GET: (req: Request) => Promise<Response>;
  const ADMIN = { user: { id: 1, rol: 'admin', empresas: [1] } };

  beforeAll(async () => {
    const mod = await import('@/app/api/admin/inversion-mercaderia/route');
    GET = mod.GET;
  });

  beforeEach(() => {
    getServerSession.mockReset();
    getServerSession.mockResolvedValue(ADMIN);
    sql.mockReset();
  });

  test('12 — el snapshot detallado NO tiene columna categoria → no se puede filtrar una fecha pasada por categoria', async () => {
    // El detalle del snapshot guarda {codigo,detalle,saldo,costo,prcventa}, sin categoria.
    // Filtrar silenciosamente con ese gap devolvería datos incompletos. El slice debe
    // rechazarlo EXPLÍCITAMENTE (400) en vez de filtrar mal.
    const res = await GET(new Request('http://localhost/api/admin/inversion-mercaderia?fecha=2026-08-19&categoria=Deporte'));
    expect(res.status).toBe(400);
  });
});
export {};
