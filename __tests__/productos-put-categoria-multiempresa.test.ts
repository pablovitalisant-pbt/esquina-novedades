/**
 * @jest-environment node
 */
/**
 * Fase B — PUT /api/productos/[id]: UPDATE sin filtro empresa_id en el SQL,
 * pero con verificación de acceso antes via SELECT por id.
 * Reescrito sobre el patrón node+mock para el PUT generalizado (S2).
 * Comportamiento preservado: sin empresa_id en el UPDATE.
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

describe('PUT /api/productos/[id] — UPDATE sin filtro empresa_id', () => {
  let PUT: (req: Request, ctx: { params: { id: string } }) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/productos/[id]/route');
    PUT = mod.PUT as unknown as typeof PUT;
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

  const setupMocks = () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] },
    });
    sql
      .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'YX-700' }])
      .mockResolvedValueOnce([{ nombre: 'Ortopedia' }]);
    sqlTransaction.mockResolvedValueOnce([[
      { id: 1, categoria: 'Ortopedia' },
      { id: 2, categoria: 'Ortopedia' },
    ]]);
  };

  test('1 — el UPDATE de categoria no filtra por empresa_id', async () => {
    setupMocks();

    const res = await PUT(makeReq({ categoria: 'Ortopedia' }), ctx);

    expect(sqlQuery).toHaveBeenCalledTimes(1);
    const [queryText] = sqlQuery.mock.calls[0];
    expect(queryText).not.toContain('empresa_id');
    expect(res.status).toBe(200);
  });

  test('2 — sin filtros devuelve 200 y el UPDATE se ejecuta', async () => {
    setupMocks();

    const res = await PUT(makeReq({ categoria: 'Ortopedia' }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
  });
});
