/**
 * @jest-environment node
 */
/**
 * Fase B — PUT /api/productos/[id]: invariante anti-drift.
 * Verifica que el servidor recalcula prcventa desde costo+margen_pct
 * y que nunca acepta los tres del cliente sin recalcular.
 * Reutiliza lib/calcular-precio.ts (ya testeada en S1).
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

const PRECIO_CALCULADO = 13.00; // calcularPrecio(10, 30) = 13.00

describe('PUT /api/productos/[id] — invariante anti-drift', () => {
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

  test('1 — costo + margen_pct: servidor recalcula prcventa (no necesita SELECT previo)', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] },
    });
    sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]);
    sqlTransaction.mockResolvedValueOnce([[{
      id: 1, costo: 10, margen_pct: 30, prcventa: PRECIO_CALCULADO,
    }]]);

    const res = await PUT(makeReq({ costo: 10, margen_pct: 30 }), ctx);
    expect(res.status).toBe(200);

    // Solo 1 SELECT (access check): no necesita leer valores actuales porque vienen ambos
    expect(sql).toHaveBeenCalledTimes(1);
    // 1 UPDATE con prcventa calculado
    expect(sqlQuery).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.data.prcventa).toBe(PRECIO_CALCULADO);
  });

  test('2 — costo sin margen_pct: lee margen actual de DB, recalcula', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] },
    });
    sql
      .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }])
      .mockResolvedValueOnce([{ costo: 8, margen_pct: 25 }]); // valores actuales
    sqlTransaction.mockResolvedValueOnce([[{
      id: 1, costo: 10, margen_pct: 25, prcventa: 12.50, // 10 * 1.25 = 12.50
    }]]);

    const res = await PUT(makeReq({ costo: 10 }), ctx);
    expect(res.status).toBe(200);

    // 2 SELECTs: access check + lectura valores actuales
    expect(sql).toHaveBeenCalledTimes(2);
    // 1 UPDATE
    expect(sqlQuery).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.data.prcventa).toBe(12.50);
    expect(body.data.margen_pct).toBe(25);
  });

  test('3 — margen_pct sin costo: lee costo actual de DB, recalcula', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] },
    });
    sql
      .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }])
      .mockResolvedValueOnce([{ costo: 8, margen_pct: 25 }]);
    sqlTransaction.mockResolvedValueOnce([[{
      id: 1, costo: 8, margen_pct: 40, prcventa: 11.20, // 8 * 1.40 = 11.20
    }]]);

    const res = await PUT(makeReq({ margen_pct: 40 }), ctx);
    expect(res.status).toBe(200);

    expect(sql).toHaveBeenCalledTimes(2);
    expect(sqlQuery).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.data.prcventa).toBe(11.20);
    expect(body.data.costo).toBe(8);
  });

  test('4 — prcventa solo con costo NULL en DB: acepta, margen_pct queda NULL', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] },
    });
    sql
      .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }])
      .mockResolvedValueOnce([{ costo: null, margen_pct: null }]);
    // Unica transaccion: UPDATE + prenota_items (prcventa enviada por cliente)
    sqlTransaction.mockResolvedValueOnce([[
      { id: 1, costo: null, margen_pct: null, prcventa: 25 },
    ], []]);

    const res = await PUT(makeReq({ prcventa: 25 }), ctx);
    expect(res.status).toBe(200);

    expect(sql).toHaveBeenCalledTimes(2);
    expect(sqlQuery).toHaveBeenCalledTimes(2);
    const body = await res.json();
    expect(body.data.prcventa).toBe(25);
    expect(body.data.margen_pct).toBeNull();
  });

  test('5 — prcventa solo con costo > 0 en DB: acepta, deriva margen_pct', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] },
    });
    sql
      .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }])
      .mockResolvedValueOnce([{ costo: 20, margen_pct: null }]);

    // Unica transaccion: UPDATE + prenota_items (prcventa enviada por cliente)
    sqlTransaction.mockResolvedValueOnce([[
      { id: 1, costo: 20, margen_pct: 25, prcventa: 25 },
    ], []]);

    const res = await PUT(makeReq({ prcventa: 25 }), ctx);
    expect(res.status).toBe(200);
    expect(sqlTransaction).toHaveBeenCalledTimes(1);
    expect(sql).toHaveBeenCalledTimes(2);
    expect(sqlQuery).toHaveBeenCalledTimes(2);
    const body = await res.json();
    expect(body.data.prcventa).toBe(25);
    expect(body.data.margen_pct).toBe(25);
  });

  test('6 — no se envían campos de precio: no hay recalculo', async () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] },
    });
    sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]);
    sql.mockResolvedValueOnce([]); // propagacion ubicaciones_bodega (detalle enviado por cliente)
    // 3 queries en la transaccion: UPDATE + ubicaciones + prenota_items
    sqlTransaction.mockResolvedValueOnce([[{ id: 1, detalle: 'Nuevo nombre' }], [], []]);

    const res = await PUT(makeReq({ detalle: 'Nuevo nombre' }), ctx);
    expect(res.status).toBe(200);

    expect(sql).toHaveBeenCalledTimes(2); // access check + propagacion
    expect(sqlQuery).toHaveBeenCalledTimes(2); // UPDATE + propagacion
  });
});
