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

let GET: typeof import('@/app/api/categorias/route').GET;
let POST: typeof import('@/app/api/categorias/route').POST;
let DELETE: typeof import('@/app/api/categorias/[id]/route').DELETE;

beforeAll(async () => {
  if (typeof (global as any).Request === 'undefined') {
    (global as any).Request = class Request {};
  }
  if (typeof (global as any).Response === 'undefined') {
    (global as any).Response = class Response {};
  }
  const routeMod = await import('@/app/api/categorias/route');
  GET = routeMod.GET;
  POST = routeMod.POST;
  const idMod = await import('@/app/api/categorias/[id]/route');
  DELETE = idMod.DELETE;
});

beforeEach(() => {
  sqlMock.mockClear();
  getServerSession.mockClear();
});

// ---------------------------------------------------------------------------
// GET /api/categorias
// ---------------------------------------------------------------------------

describe('GET /api/categorias', () => {
  test('devuelve lista de categorías con total_productos', async () => {
    sqlMock.mockResolvedValueOnce([
      { id: 1, nombre: 'Belleza', created_at: '2026-01-01', total_productos: 5 },
    ]);

    const req = {} as Request;
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({ id: 1, nombre: 'Belleza', total_productos: 5 });
  });
});

// ---------------------------------------------------------------------------
// POST /api/categorias
// ---------------------------------------------------------------------------

describe('POST /api/categorias', () => {
  test('supervisor puede crear categoría', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] }, // TODO: remover rol supervisor (PRD §9.8)
    });
    sqlMock.mockResolvedValueOnce([
      { id: 2, nombre: 'Deporte', created_at: '2026-01-01' },
    ]);

    const req = {
      json: async () => ({ nombre: 'Deporte' }),
    } as Request;

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ id: 2, nombre: 'Deporte' });
  });

  test('retorna 400 si nombre está vacío', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] }, // TODO: remover rol supervisor (PRD §9.8)
    });

    const req = {
      json: async () => ({ nombre: '' }),
    } as Request;

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('retorna 403 si rol es vendedor', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'vendedor', empresas: [2] },
    });

    const req = {
      json: async () => ({ nombre: 'Test' }),
    } as Request;

    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/categorias/[id]
// ---------------------------------------------------------------------------

describe('DELETE /api/categorias/[id]', () => {
  test('admin puede eliminar categoría sin productos asignados', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] },
    });
    sqlMock
      .mockResolvedValueOnce([{ total: 0 }])  // COUNT productos
      .mockResolvedValueOnce([]);              // DELETE

    const req = {} as Request;
    const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
  });

  // Slice 21: comportamiento real — soft cleanup, no rechazo
  test('retorna 200 con productos_desasignados aunque tenga productos', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] },
    });
    sqlMock
      .mockResolvedValueOnce([{ total: 3 }])  // COUNT productos
      .mockResolvedValueOnce([])               // UPDATE SET NULL
      .mockResolvedValueOnce([]);              // DELETE

    const req = {} as Request;
    const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.productos_desasignados).toBe(3);
  });

  // Slice 21: admin puede eliminar. Test de vendedor rechazado.
  test('retorna 403 si rol es vendedor', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'vendedor', empresas: [2] },
    });

    const req = {} as Request;
    const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(403);
  });
});
export {};
