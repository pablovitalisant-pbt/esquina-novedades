/**
 * @jest-environment node
 */
const getServerSession = jest.fn();
const sqlMock = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));
jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sqlMock(...args),
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

let POST: typeof import('./route').POST;
let GET: typeof import('./route').GET;

beforeAll(async () => {
  const routeMod = await import('./route');
  POST = routeMod.POST;
  GET = routeMod.GET;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('app/api/sync-conflictos', () => {
  it('POST retorna 401 sin sesión', async () => {
    getServerSession.mockResolvedValue(null as any);
    const res = await POST(new Request('http://localhost/api/sync-conflictos', { method: 'POST', body: '{}' }) as any);
    expect(res.status).toBe(401);
  });

  it('POST con sesión (bodeguero) crea conflicto con estado pendiente', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'bodeguero', nombre: 'Bodega' } } as any);
    sqlMock.mockResolvedValueOnce([{ id: 1, tabla: 'ubicaciones_bodega', operacion: 'PATCH', estado: 'pendiente' }] as any);

    const res = await POST(new Request('http://localhost/api/sync-conflictos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabla: 'ubicaciones_bodega', operacion: 'PATCH', entidad_id: 'A-001', payload: { ubicacion: 'B2' }, http_status: 500, error_mensaje: 'boom' }),
    }) as any);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.estado).toBe('pendiente');
    // INSERT incluye estado 'pendiente'
    const q = String(sqlMock.mock.calls[0][0]);
    expect(q).toContain('INSERT INTO sync_conflictos');
    expect(q).toContain("'pendiente'");
  });

  it('POST retorna 400 si falta tabla', async () => {
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'admin' } } as any);
    const res = await POST(new Request('http://localhost/api/sync-conflictos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operacion: 'PATCH', payload: {} }),
    }) as any);
    expect(res.status).toBe(400);
  });

  it('GET retorna 403 para no-admin', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'bodeguero' } } as any);
    const res = await GET(new Request('http://localhost/api/sync-conflictos') as any);
    expect(res.status).toBe(403);
  });

  it('GET retorna 200 para admin con estado default pendiente', async () => {
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'admin' } } as any);
    sqlMock.mockResolvedValueOnce([{ id: 1, estado: 'pendiente' }] as any);
    const res = await GET(new Request('http://localhost/api/sync-conflictos') as any);
    expect(res.status).toBe(200);
    // La query usa estado default 'pendiente' (strings + valor interpolado)
    const all = sqlMock.mock.calls[0].map(String).join(' ');
    expect(all).toContain('WHERE estado =');
    expect(all).toContain('pendiente');
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });
});
