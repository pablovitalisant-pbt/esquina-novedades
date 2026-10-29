/**
 * @jest-environment node
 */
/**
 * Fase B — Slice 2a: PUT /api/productos/[id] con precios directos.
 * prcventa se ingresa; el servidor deriva margen_pct desde costo y prcventa.
 * Cambiar el costo NUNCA cambia prcventa.
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

const updateCall = () => {
  const call = sqlQuery.mock.calls.find((c: any[]) => /UPDATE public\.productos/.test(c[0]));
  return { query: String(call?.[0] ?? ''), params: (call?.[1] ?? []) as unknown[] };
};

describe('PUT /api/productos/[id] — precios directos', () => {
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
    getServerSession.mockResolvedValue({ user: { rol: 'admin', empresas: [2] } });
    sqlTransaction.mockResolvedValue([[{ id: 1 }]]);
  });

  const makeReq = (body: unknown) =>
    new NextRequest('http://localhost/api/productos/1', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });

  const ctx = { params: { id: '1' } };

  const current = (over: Record<string, unknown> = {}) => ({
    empresa_id: 2,
    codigo: 'PROD-01',
    costo: 1000,
    prcventa: 1500,
    precio_mayor: null,
    ...over,
  });

  test('1 — costo + prcventa: margen calculado, sin recálculo de prcventa', async () => {
    sql.mockResolvedValueOnce([current()]);

    const res = await PUT(makeReq({ costo: 1000, prcventa: 1500 }), ctx);
    expect(res.status).toBe(200);

    expect(sql).toHaveBeenCalledTimes(1); // solo access check
    const { query, params } = updateCall();
    expect(query).toMatch(/margen_pct = \$/);
    expect(params).toContain(50);
    expect(params).toContain(1500);
    // prcventa viene del cliente → se propaga a prenota_items
    expect(sqlQuery).toHaveBeenCalledTimes(2);
  });

  test('2 — costo solo: lee prcventa de DB, recalcula margen y NO toca prcventa', async () => {
    sql.mockResolvedValueOnce([current()]);

    const res = await PUT(makeReq({ costo: 1200 }), ctx);
    expect(res.status).toBe(200);

    expect(sql).toHaveBeenCalledTimes(1);
    expect(sqlQuery).toHaveBeenCalledTimes(1);
    const { query, params } = updateCall();
    expect(query).not.toMatch(/prcventa = \$/);
    expect(params).toContain(1200);
    expect(params).toContain(25); // (1500/1200 - 1) * 100
  });

  test('3 — prcventa solo: deriva margen del costo actual de DB', async () => {
    sql.mockResolvedValueOnce([current({ costo: 20, prcventa: 20 })]);

    const res = await PUT(makeReq({ prcventa: 25 }), ctx);
    expect(res.status).toBe(200);

    expect(sql).toHaveBeenCalledTimes(1);
    expect(sqlQuery).toHaveBeenCalledTimes(2); // UPDATE + prenota_items
    const { params } = updateCall();
    expect(params).toContain(25);
    expect(params).toContain(25); // margen_pct también 25
  });

  test('4 — prcventa con costo NULL en DB: margen_pct queda NULL', async () => {
    sql.mockResolvedValueOnce([current({ costo: null, prcventa: 20 })]);

    const res = await PUT(makeReq({ prcventa: 25 }), ctx);
    expect(res.status).toBe(200);

    expect(sqlQuery).toHaveBeenCalledTimes(2);
    const { params } = updateCall();
    expect(params).toContain(null);
  });

  test('5 — costo cambia y prcventa NO cambia aunque el body traiga ambos', async () => {
    sql.mockResolvedValueOnce([current({ costo: 800, prcventa: 1500 })]);

    const res = await PUT(makeReq({ costo: 1000, prcventa: 1500 }), ctx);
    expect(res.status).toBe(200);

    const { query, params } = updateCall();
    expect(query).toMatch(/prcventa = \$/); // vino del cliente
    expect(params).toContain(1500);
  });

  test('6 — margen_pct del body se ignora si no hay costo/prcventa', async () => {
    sql.mockResolvedValueOnce([current()]);

    const res = await PUT(makeReq({ margen_pct: 999 }), ctx);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.message).toMatch(/nada/i);
    expect(sql).toHaveBeenCalledTimes(0);
  });

  test('7 — no se envían campos de precio: no hay recalculo', async () => {
    sql.mockResolvedValueOnce([current()]);
    sql.mockResolvedValueOnce([]); // propagacion ubicaciones_bodega (detalle enviado por cliente)

    const res = await PUT(makeReq({ detalle: 'Nuevo nombre' }), ctx);
    expect(res.status).toBe(200);

    expect(sql).toHaveBeenCalledTimes(2); // access check + propagacion
    const { query } = updateCall();
    expect(query).not.toMatch(/margen_pct/);
    expect(query).not.toMatch(/prcventa/);
  });
});
