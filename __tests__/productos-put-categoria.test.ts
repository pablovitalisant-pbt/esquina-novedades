/**
 * @jest-environment node
 */
/**
 * Fase B — PUT /api/productos/[id]: validación de categoria.
 * Reescrito sobre el patrón node+mock para el PUT generalizado (S2).
 * Comportamiento preservado: categoria válida → 200, inválida → 400, null → 200.
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

describe('PUT /api/productos/[id] — categoria', () => {
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

  test('1 — categoria valida en DB retorna 200', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] },
    });
    sql
      .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'MED-01' }])
      .mockResolvedValueOnce([{ nombre: 'Medicina' }]);
    sqlTransaction.mockResolvedValueOnce([[{ id: 1, categoria: 'Medicina' }]]);

    const res = await PUT(makeReq({ categoria: 'Medicina' }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.categoria).toBe('Medicina');
  });

  test('2 — categoria no encontrada en DB retorna 400', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] },
    });
    sql
      .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'MED-01' }]) // access check ok
      .mockResolvedValueOnce([]); // categoria no existe

    const res = await PUT(makeReq({ categoria: 'CategoriaQueNoExiste' }), ctx);
    expect(res.status).toBe(400);
  });

  test('3 — categoria null aceptada (quitar categoria)', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] },
    });
    sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'MED-01' }]);
    sqlTransaction.mockResolvedValueOnce([[{ id: 1, categoria: null }]]);

    const res = await PUT(makeReq({ categoria: null }), ctx);
    expect(res.status).toBe(200);
  });
});
