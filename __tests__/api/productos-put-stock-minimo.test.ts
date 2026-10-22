/**
 * @jest-environment node
 *
 * Fase B — stock_minimo en PUT /api/productos/[id].
 * R5: null explicito → limpia alerta.
 * R6: negativo o no numerico → 400.
 */

const getServerSession = jest.fn();
const sqlMock = jest.fn().mockResolvedValue([]);
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
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

let PUT: typeof import('@/app/api/productos/[id]/route').PUT;

describe('T4 — PUT /api/productos/[id] con stock_minimo', () => {
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
    jest.clearAllMocks();
    sqlMock.mockResolvedValue([]);
    sqlTransaction.mockClear();
    sqlQueryMock.mockClear();
    sqlQueryMock.mockReturnValue({});
    getServerSession.mockResolvedValue({ user: { rol: 'admin', empresas: [1] } });
  });

  it('stock_minimo: null explicito → limpia el valor (apaga alerta)', async () => {
    sqlMock
      .mockImplementationOnce(() => [{ empresa_id: 1, codigo: 'SM-TEST' }]); // access check
    sqlTransaction.mockResolvedValue([[{ id: 1, codigo: 'SM-TEST', stock_minimo: null }]]);

    const res = await PUT(
      { json: () => Promise.resolve({ stock_minimo: null }) } as any,
      { params: Promise.resolve({ id: '1' }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.stock_minimo).toBeNull();

    // Verificar que stock_minimo se paso al UPDATE (no se omitio)
    const txQuery = sqlQueryMock.mock.calls[0][0];
    expect(txQuery).toMatch(/stock_minimo/i);
  });

  it('stock_minimo negativo → 400', async () => {
    sqlMock
      .mockImplementationOnce(() => [{ empresa_id: 1, codigo: 'SM-TEST' }]); // access check

    const res = await PUT(
      { json: () => Promise.resolve({ stock_minimo: -5 }) } as any,
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(400);
  });

  it('stock_minimo booleano → 400 (esNumeroValido)', async () => {
    sqlMock
      .mockImplementationOnce(() => [{ empresa_id: 1, codigo: 'SM-TEST' }]);

    const res = await PUT(
      { json: () => Promise.resolve({ stock_minimo: true }) } as any,
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(400);
  });

  it('stock_minimo = 0 → valido (permite alerta permanente para agotados)', async () => {
    sqlMock
      .mockImplementationOnce(() => [{ empresa_id: 1, codigo: 'SM-TEST' }]);
    sqlTransaction.mockResolvedValue([[{ id: 1, codigo: 'SM-TEST', stock_minimo: 0 }]]);

    const res = await PUT(
      { json: () => Promise.resolve({ stock_minimo: 0 }) } as any,
      { params: Promise.resolve({ id: '1' }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.stock_minimo).toBe(0);
  });

  it('stock_minimo valido (10) → se actualiza correctamente', async () => {
    sqlMock
      .mockImplementationOnce(() => [{ empresa_id: 1, codigo: 'SM-TEST' }]);
    sqlTransaction.mockResolvedValue([[{ id: 1, codigo: 'SM-TEST', stock_minimo: 10 }]]);

    const res = await PUT(
      { json: () => Promise.resolve({ stock_minimo: 10 }) } as any,
      { params: Promise.resolve({ id: '1' }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.stock_minimo).toBe(10);
  });
});
