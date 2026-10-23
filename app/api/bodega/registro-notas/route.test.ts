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

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

let GET: typeof import('./route').GET;
let POST: typeof import('./route').POST;

beforeAll(async () => {
  if (typeof (global as any).Request === 'undefined') {
    (global as any).Request = class Request {};
  }
  const routeMod = await import('./route');
  GET = routeMod.GET;
  POST = routeMod.POST;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('app/api/bodega/registro-notas', () => {

  it('GET devuelve lista de registros', async () => {
    getServerSession.mockResolvedValue({ user: { id: '3', nombre: 'Pedro', rol: 'bodeguero' } } as any);
    sqlMock.mockResolvedValueOnce([
      {
        id: 1,
        folio: '001234',
        empresa_id: 2,
        usuario_nombre: 'Pedro',
        observacion: 'Urgente',
        created_at: '2026-04-24T10:00:00Z',
      },
    ] as any);

    const res = await GET(new Request('http://localhost/api/bodega/registro-notas') as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data[0].folio).toBe('001234');

    const firstArg = sqlMock.mock.calls[0]?.[0];
    const queryText = Array.isArray(firstArg) ? firstArg.join(' ') : String(firstArg);
    expect(queryText).toContain('registro_notas_bodega');
  });

  it('GET retorna 401 sin sesión', async () => {
    getServerSession.mockResolvedValue(null as any);

    const res = await GET(new Request('http://localhost/api/bodega/registro-notas') as any);

    expect(res.status).toBe(401);
  });

  it('POST crea registro correctamente', async () => {
    getServerSession.mockResolvedValue({ user: { id: '3', nombre: 'Pedro', rol: 'bodeguero' } } as any);
    sqlMock.mockResolvedValueOnce([
      {
        id: 1,
        folio: '001234',
        empresa_id: 2,
        usuario_id: 3,
        usuario_nombre: 'Pedro',
        observacion: null,
        created_at: '2026-04-24T10:00:00Z',
      },
    ] as any);

    const req = new Request('http://localhost/api/bodega/registro-notas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folio: '001234', empresa_id: 2, observacion: null }),
    });
    const res = await POST(req as any);

    expect(res.status).toBe(201);

    const firstArg = sqlMock.mock.calls[0]?.[0];
    const queryText = Array.isArray(firstArg) ? firstArg.join(' ') : String(firstArg);
    expect(queryText).toContain('INSERT');
  });

  it('POST retorna 400 si falta folio', async () => {
    getServerSession.mockResolvedValue({ user: { id: '3', nombre: 'Pedro', rol: 'bodeguero' } } as any);

    const req = new Request('http://localhost/api/bodega/registro-notas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa_id: 2 }),
    });
    const res = await POST(req as any);

    expect(res.status).toBe(400);
  });
});
export {};
