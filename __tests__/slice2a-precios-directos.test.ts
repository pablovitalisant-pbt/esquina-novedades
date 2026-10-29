/**
 * @jest-environment node
 *
 * Fase B — Slice 2a: precios directos.
 * prcventa y precio_mayor se ingresan; margen_pct lo calcula el servidor.
 * Cambiar el costo NUNCA cambia prcventa.
 */
const getServerSession = jest.fn();
const sql = jest.fn();
const sqlQuery = jest.fn();
const sqlTransaction = jest.fn();

jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));
jest.mock('@/lib/db', () => {
  const fn = (...args: any[]) => sql(...args);
  fn.query = (...args: any[]) => sqlQuery(...args);
  fn.transaction = (...args: any[]) => sqlTransaction(...args);
  return { sql: fn };
});

import { calcularMargen } from '@/lib/calcular-precio';
import { POST } from '../app/api/productos/route';
import { PUT } from '../app/api/productos/[id]/route';

const postReq = (body: any) => ({ json: () => Promise.resolve(body) }) as any;
const putReq = (body: any) => ({ json: () => Promise.resolve(body) }) as any;
const ctx = { params: Promise.resolve({ id: '1' }) };

const BASE = { codigo: 'PD-1', detalle: 'x', costo: 1000, prcventa: 1500 };

const updateCall = () => {
  const call = sqlQuery.mock.calls.find((c: any[]) => /UPDATE public\.productos/.test(c[0]));
  return { query: String(call?.[0] ?? ''), params: (call?.[1] ?? []) as unknown[] };
};

beforeEach(() => {
  jest.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { rol: 'admin', empresas: [1] } });
  sqlQuery.mockReturnValue({});
  sqlTransaction.mockResolvedValue([[{ id: 1 }]]);
});

describe('calcularMargen', () => {
  test('costo 1000, precio 1500 → 50', () => {
    expect(calcularMargen(1000, 1500)).toBe(50);
  });
  test('redondea a 2 decimales', () => {
    expect(calcularMargen(3, 10)).toBe(233.33);
  });
  test('costo 0 o null → null', () => {
    expect(calcularMargen(0, 1500)).toBeNull();
    expect(calcularMargen(null, 1500)).toBeNull();
  });
  test('precio 0 o null → null', () => {
    expect(calcularMargen(1000, 0)).toBeNull();
    expect(calcularMargen(1000, null)).toBeNull();
  });
});

describe('POST — precios directos', () => {
  test('sin prcventa → 400', async () => {
    const res = await POST(postReq({ codigo: 'A', detalle: 'x', costo: 10 }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  test('sin costo → 400', async () => {
    const res = await POST(postReq({ codigo: 'A', detalle: 'x', prcventa: 10 }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  test('prcventa no entero → 400', async () => {
    const res = await POST(postReq({ ...BASE, prcventa: 1500.5 }));
    expect(res.status).toBe(400);
  });

  test('precio_mayor >= prcventa → 400', async () => {
    const res = await POST(postReq({ ...BASE, precio_mayor: 1500 }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  test.each([0, 1.5, -1, '3', true])('minimo_mayor invalido %p → 400', async (v) => {
    const res = await POST(postReq({ ...BASE, precio_mayor: 1200, minimo_mayor: v }));
    expect(res.status).toBe(400);
  });

  test('minimo_mayor sin precio_mayor → 400', async () => {
    const res = await POST(postReq({ ...BASE, minimo_mayor: 3 }));
    expect(res.status).toBe(400);
  });

  test('margen_pct del body se ignora: se calcula desde costo y prcventa', async () => {
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 1 }]);
    const res = await POST(postReq({ ...BASE, margen_pct: 999 }));
    expect(res.status).toBe(201);
    const params = sql.mock.calls[1].slice(1) as unknown[];
    expect(params).toContain(1500); // prcventa directa
    expect(params).toContain(50); // margen calculado
    expect(params).not.toContain(999);
  });

  test('precio_mayor y minimo_mayor validos → 201 e INSERT los incluye', async () => {
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 1 }]);
    const res = await POST(postReq({ ...BASE, precio_mayor: 1200, minimo_mayor: 3 }));
    expect(res.status).toBe(201);
    expect(sql.mock.calls[1][0].join('')).toMatch(/minimo_mayor/);
    const params = sql.mock.calls[1].slice(1) as unknown[];
    expect(params).toContain(1200);
    expect(params).toContain(3);
  });
});

describe('PUT — precios directos', () => {
  const current = (over: Record<string, unknown> = {}) => ({
    empresa_id: 1,
    codigo: 'PD-1',
    costo: 1000,
    prcventa: 1500,
    precio_mayor: null,
    ...over,
  });

  test('cambiar costo NO cambia prcventa (assert sobre el UPDATE)', async () => {
    sql.mockResolvedValueOnce([current()]);
    const res = await PUT(putReq({ costo: 1200 }), ctx);
    expect(res.status).toBe(200);
    const { query, params } = updateCall();
    expect(query).toMatch(/costo = \$/);
    expect(query).toMatch(/margen_pct = \$/);
    expect(query).not.toMatch(/prcventa = \$/);
    expect(params).toContain(1200);
    expect(params).toContain(25); // (1500/1200 - 1) * 100
    expect(params).not.toContain(1500);
  });

  test('margen calculado: costo 1000, prcventa 1500 → 50', async () => {
    sql.mockResolvedValueOnce([current()]);
    const res = await PUT(putReq({ costo: 1000, prcventa: 1500 }), ctx);
    expect(res.status).toBe(200);
    const { params } = updateCall();
    expect(params).toContain(50);
    expect(params).toContain(1500);
  });

  test('margen_pct del body se ignora', async () => {
    sql.mockResolvedValueOnce([current()]);
    const res = await PUT(putReq({ costo: 1000, prcventa: 1500, margen_pct: 999 }), ctx);
    expect(res.status).toBe(200);
    const { params } = updateCall();
    expect(params).toContain(50);
    expect(params).not.toContain(999);
  });

  test('precio_mayor >= prcventa → 400', async () => {
    sql.mockResolvedValueOnce([current()]);
    const res = await PUT(putReq({ precio_mayor: 1500 }), ctx);
    expect(res.status).toBe(400);
    expect(sqlTransaction).not.toHaveBeenCalled();
  });

  test('PUT solo prcventa que queda <= precio_mayor actual de DB → 400', async () => {
    sql.mockResolvedValueOnce([current({ prcventa: 1000, precio_mayor: 800 })]);
    const res = await PUT(putReq({ prcventa: 800 }), ctx);
    expect(res.status).toBe(400);
  });

  test('precio_mayor null limpia minimo_mayor', async () => {
    sql.mockResolvedValueOnce([current({ prcventa: 1000, precio_mayor: 800 })]);
    const res = await PUT(putReq({ precio_mayor: null }), ctx);
    expect(res.status).toBe(200);
    const { query } = updateCall();
    expect(query).toMatch(/minimo_mayor = \$/);
  });

  test.each([0, 1.5, -1, '3', true])('minimo_mayor invalido %p → 400', async (v) => {
    sql.mockResolvedValueOnce([current()]);
    const res = await PUT(putReq({ minimo_mayor: v }), ctx);
    expect(res.status).toBe(400);
  });
});
