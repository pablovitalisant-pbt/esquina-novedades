/**
 * @jest-environment node
 *
 * Fase B — stock_minimo: GET /api/productos incluye stock_minimo en respuesta.
 * R11: el SELECT con MAX(p.stock_minimo) debe devolver el campo.
 */

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));
jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sql(...args),
}));

import { GET } from '../../app/api/productos/route';

function makeGetRequest(search: string) {
  return new Request(`http://localhost/api/productos?search=${encodeURIComponent(search)}`);
}

describe('T6 — GET /api/productos incluye stock_minimo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'admin', empresas: [1] } });
  });

  it('respuesta incluye stock_minimo cuando sql lo devuelve', async () => {
    sql.mockResolvedValue([
      { codigo: 'TEST-01', detalle: 'Test', saldo: 10, prcventa: 100, stock_minimo: 5 },
    ]);
    const res = await GET(makeGetRequest('TEST'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].stock_minimo).toBe(5);
  });

  it('respuesta incluye stock_minimo: null cuando no hay minimo configurado', async () => {
    sql.mockResolvedValue([
      { codigo: 'TEST-02', detalle: 'Test', saldo: 10, prcventa: 100, stock_minimo: null },
    ]);
    const res = await GET(makeGetRequest('TEST'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data[0].stock_minimo).toBeNull();
  });

  it('la query del GET incluye MAX(p.stock_minimo) en el SELECT', async () => {
    sql.mockResolvedValue([]);
    await GET(makeGetRequest('TEST'));
    const query = sql.mock.calls[0][0].join('');
    expect(query).toMatch(/MAX\s*\(\s*p\.stock_minimo\s*\)/i);
  });
});
