/**
 * @jest-environment node
 */
/**
 * Fase B — PUT /api/productos/[id]: UPDATE por codigo afecta todos los lotes.
 * Reescrito sobre el patrón node+mock para el PUT generalizado (S2).
 * Comportamiento preservado: UPDATE usa WHERE codigo, no WHERE id.
 */
import { NextRequest } from 'next/server';

const getServerSession = jest.fn();
const sql = jest.fn();
const sqlQuery = jest.fn();
const sqlTransaction = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => {
  const fn = (...args: any[]) => sql(...args);
  fn.query = (...args: any[]) => sqlQuery(...args);
  fn.transaction = (...args: any[]) => sqlTransaction(...args);
  return { sql: fn };
});

describe('PUT /api/productos/[id] — UPDATE por codigo afecta todos los lotes', () => {
  let PUT: (req: Request, ctx: { params: { id: string } }) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/productos/[id]/route');
    PUT = mod.PUT;
  });

  beforeEach(() => {
    getServerSession.mockClear();
    sql.mockClear();
    sqlQuery.mockClear();
    sqlQuery.mockReturnValue({ queryData: {} });
    sqlTransaction.mockClear();
  });

  const makeReq = (body: unknown) =>
    new NextRequest('http://localhost/api/productos/1', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });

  const ctx = { params: { id: '1' } };

  test('1 — UPDATE con categoria valida retorna 200 y actualiza todas las filas del codigo', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] },
    });
    sql
      .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'MED-01' }])
      .mockResolvedValueOnce([{ nombre: 'Medicina' }]);
    sqlTransaction.mockResolvedValueOnce([[
      { id: 1, categoria: 'Medicina' },
      { id: 2, categoria: 'Medicina' },
    ]]);

    const res = await PUT(makeReq({ categoria: 'Medicina' }), ctx);
    expect(res.status).toBe(200);
  });

  test('2 — el UPDATE usa WHERE codigo, no WHERE id', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] },
    });
    sql
      .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'MED-01' }])
      .mockResolvedValueOnce([{ nombre: 'Medicina' }]);
    sqlTransaction.mockResolvedValueOnce([[
      { id: 1, categoria: 'Medicina' },
      { id: 2, categoria: 'Medicina' },
    ]]);

    await PUT(makeReq({ categoria: 'Medicina' }), ctx);

    expect(sqlQuery).toHaveBeenCalledTimes(1);
    const [queryText] = sqlQuery.mock.calls[0];
    expect(queryText).not.toMatch(/WHERE\s+id\s*=/i);
    expect(queryText.toLowerCase()).toContain('codigo');
  });

  test('3 — categoria null actualiza todas las filas del codigo', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] },
    });
    sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'MED-01' }]);
    sqlTransaction.mockResolvedValueOnce([[
      { id: 1, categoria: null },
      { id: 2, categoria: null },
    ]]);

    const res = await PUT(makeReq({ categoria: null }), ctx);
    expect(res.status).toBe(200);
  });
});
