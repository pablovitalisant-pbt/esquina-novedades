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

let PATCH: typeof import('./route').PATCH;

beforeAll(async () => {
  const routeMod = await import('./route');
  PATCH = routeMod.PATCH;
});

beforeEach(() => {
  jest.clearAllMocks();
});

const patchReq = (body: any) => new Request('http://localhost/api/sync-conflictos/5', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as any;

describe('app/api/sync-conflictos/[id]', () => {
  it('PATCH retorna 401 sin sesión', async () => {
    getServerSession.mockResolvedValue(null as any);
    const res = await PATCH(patchReq({ accion: 'descartar' }), { params: Promise.resolve({ id: '5' }) });
    expect(res.status).toBe(401);
  });

  it('PATCH retorna 403 para no-admin', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'vendedor' } } as any);
    const res = await PATCH(patchReq({ accion: 'descartar' }), { params: Promise.resolve({ id: '5' }) });
    expect(res.status).toBe(403);
  });

  it('PATCH retorna 400 con accion inválida', async () => {
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'admin' } } as any);
    const res = await PATCH(patchReq({ accion: 'reintentar' }), { params: Promise.resolve({ id: '5' }) });
    expect(res.status).toBe(400);
  });

  it('PATCH descarta (200) un conflicto pendiente', async () => {
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'admin', nombre: 'Admin' } } as any);
    sqlMock.mockResolvedValueOnce([{ id: 5 }] as any); // UPDATE afectó 1 fila
    const res = await PATCH(patchReq({ accion: 'descartar' }), { params: Promise.resolve({ id: '5' }) });
    expect(res.status).toBe(200);
    const q = String(sqlMock.mock.calls[0][0]);
    expect(q).toContain('UPDATE sync_conflictos');
    expect(q).toContain("estado = 'resuelto'");
    expect(q).toContain("accion_tomada = 'descartado'");
    expect(q).toContain("estado = 'pendiente'");
  });

  it('PATCH retorna 409 si ya estaba resuelto (idempotencia)', async () => {
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'admin' } } as any);
    sqlMock.mockResolvedValueOnce([] as any); // UPDATE no afectó filas (ya resuelto)
    sqlMock.mockResolvedValueOnce([{ id: 5, estado: 'resuelto' }] as any); // SELECT confirma
    const res = await PATCH(patchReq({ accion: 'descartar' }), { params: Promise.resolve({ id: '5' }) });
    expect(res.status).toBe(409);
  });

  it('PATCH retorna 404 si el conflicto no existe', async () => {
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'admin' } } as any);
    sqlMock.mockResolvedValueOnce([] as any); // UPDATE sin filas
    sqlMock.mockResolvedValueOnce([] as any); // SELECT sin filas → no existe
    const res = await PATCH(patchReq({ accion: 'descartar' }), { params: Promise.resolve({ id: '99' }) });
    expect(res.status).toBe(404);
  });
});
