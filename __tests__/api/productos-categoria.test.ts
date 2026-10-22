/**
 * @jest-environment node
 */
/**
 * Test pre-existente del handler PUT /api/productos/[id] — campo categoria.
 * Actualizado al PUT generalizado (S2): access check antes de validacion de categoria,
 * UPDATE via sql.query().
 */
const getServerSession = jest.fn();
const sqlMock = jest.fn().mockResolvedValue([]); // Slice 21: default vacio
const sqlQueryMock = jest.fn();
const sqlTransaction = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => {
  const fn = (...args: any[]) => sqlMock(...args);
  fn.query = (...args: any[]) => sqlQueryMock(...args);
  fn.transaction = (...args: any[]) => sqlTransaction(...args);
  return { sql: fn };
});

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

let PUT: typeof import('@/app/api/productos/[id]/route').PUT;

describe('PUT /api/productos/[id] — campo categoria', () => {
  beforeAll(async () => {
    if (typeof (global as any).Request === 'undefined') {
      (global as any).Request = class Request {};
    }
    if (typeof (global as any).Response === 'undefined') {
      (global as any).Response = class Response {};
    }
    const mod = await import('@/app/api/productos/[id]/route');
    PUT = mod.PUT;
  });

  beforeEach(() => {
    sqlMock.mockClear();
    sqlTransaction.mockClear();      // mockClear preserva el default mockResolvedValue([])
    sqlQueryMock.mockClear();
    sqlQueryMock.mockReturnValue({ queryData: {} }); // dummy para construir query objects
    getServerSession.mockClear();
  });

  test('supervisor puede actualizar categoria con valor válido', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] }, // TODO: remover rol supervisor (PRD §9.8)
    });

    sqlMock
      .mockImplementationOnce(() => [{ empresa_id: 2, codigo: 'TEST-001' }]) // access check
      .mockImplementationOnce(() => [{ nombre: 'Belleza' }]);               // validacion categoria
    sqlTransaction.mockResolvedValue([[{ id: 1, categoria: 'Belleza' }]]); // transaccion

    const req = {
      json: async () => ({ categoria: 'Belleza' }),
    } as Request;

    const res = await PUT(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.categoria).toBe('Belleza');
  });

  test('retorna 400 si la categoria no es un valor permitido', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] }, // TODO: remover rol supervisor (PRD §9.8)
    });

    sqlMock
      .mockImplementationOnce(() => [{ empresa_id: 2, codigo: 'TEST-001' }]) // access check
      .mockImplementationOnce(() => []);                                     // categoria inexistente → 400

    const req = {
      json: async () => ({ categoria: 'Inexistente' }),
    } as Request;

    const res = await PUT(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
  });

  test('supervisor puede quitar categoria enviando null', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] }, // TODO: remover rol supervisor (PRD §9.8)
    });

    sqlMock
      .mockImplementationOnce(() => [{ empresa_id: 2, codigo: 'TEST-001' }]); // access check
    sqlTransaction.mockResolvedValue([[{ id: 1, categoria: null }]]);          // transaccion

    const req = {
      json: async () => ({ categoria: null }),
    } as Request;

    const res = await PUT(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.categoria).toBeNull();
  });

  test('bodeguero no puede cambiar categoria — retorna 403', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'bodeguero', empresas: [2] },
    });

    const req = {
      json: async () => ({ categoria: 'Deporte' }),
    } as Request;

    const res = await PUT(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(403);
  });
});
