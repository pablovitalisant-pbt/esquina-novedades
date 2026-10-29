/**
 * @jest-environment node
 *
 * Fase B — Slice 1 (actualizado Slice 3a): POST /api/notas-venta/[id]/items.
 * R1 (concurrencia), R3 (ub_bodega), R4 (cantidad invalida), R6, R7 (estado).
 */

import { NextRequest } from 'next/server';
import { POST as POST_ITEM } from '@/app/api/notas-venta/[id]/items/route';

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sql(...args),
}));

const makeReq = (body: any) => new NextRequest('http://localhost', {
  method: 'POST', body: JSON.stringify(body),
});

const BASE_BODY = { codigo: 'PROD-01', descripcion: 'Producto test', empresa_id: 1, unidades: 20, precio: 10 };

// Secuencia SQL: 1) nota  2) producto  3) liberación  4) UPDATE stock
//                5) UPDATE ub_bodega  6) INSERT item  7) UPDATE prenotas
const MOCK_ACTIVA = [{ estado: 'activa' }];
const MOCK_PRODUCTO = [{ prcventa: 10, precio_mayor: 8 }];
const MOCK_LIBERA = [{ liberados: 0, unidades: 0 }];
const MOCK_STOCK_OK = [{ saldo: 80 }];
const MOCK_INSERT_OK = [{ id: 1, codigo: 'PROD-01', unidades: 20 }];

const ctx = { params: Promise.resolve({ id: '1' }) };

function happyPath() {
  sql
    .mockResolvedValueOnce(MOCK_ACTIVA)
    .mockResolvedValueOnce(MOCK_PRODUCTO)
    .mockResolvedValueOnce(MOCK_LIBERA)
    .mockResolvedValueOnce(MOCK_STOCK_OK)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(MOCK_INSERT_OK)
    .mockResolvedValueOnce([]);
}

describe('POST /api/notas-venta/[id]/items — reserva de stock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'vendedor', empresas: [1] } });
  });

  it('R7: nota anulada → 422, no descuenta stock', async () => {
    sql.mockResolvedValueOnce([{ estado: 'anulada' }]);
    const res = await POST_ITEM(makeReq(BASE_BODY), ctx);
    expect(res.status).toBe(422);
    expect(sql.mock.calls.length).toBe(1);
  });

  it('nota activa + stock suficiente → 200, UPDATE e INSERT ejecutados', async () => {
    happyPath();
    const res = await POST_ITEM(makeReq(BASE_BODY), ctx);
    expect(res.status).toBe(200);

    expect(sql.mock.calls[2][0].join('')).toMatch(/WITH\s+vencidos/i);
    const updateCall = sql.mock.calls[3][0].join('');
    expect(updateCall).toMatch(/UPDATE.*productos.*saldo\s*=\s*saldo\s*-/i);
    expect(updateCall).toMatch(/WHERE.*codigo/i);
    expect(sql.mock.calls[3][1]).toBe(20);   // cantidadTotal = unidades
    expect(sql.mock.calls[3][4]).toBe(20);   // mismo valor en saldo >=
  });

  it.each([0, -5, 'abc', undefined])('R4: unidades=%p → 400, sin tocar DB', async (unidades) => {
    const res = await POST_ITEM(makeReq({ ...BASE_BODY, unidades }), ctx);
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it('stock insuficiente → 400, disponible y solicitado en respuesta', async () => {
    sql
      .mockResolvedValueOnce(MOCK_ACTIVA)
      .mockResolvedValueOnce(MOCK_PRODUCTO)
      .mockResolvedValueOnce(MOCK_LIBERA)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ saldo: 5 }]);

    const res = await POST_ITEM(makeReq(BASE_BODY), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/stock.*insuficiente/i);
    expect(body.disponible).toBe(5);
    expect(body.solicitado).toBe(20);
  });

  it('R1: dos requests simultaneos, el segundo ve saldo reducido', async () => {
    happyPath();
    const res1 = await POST_ITEM(makeReq(BASE_BODY), ctx);
    expect(res1.status).toBe(200);

    sql
      .mockResolvedValueOnce(MOCK_ACTIVA)
      .mockResolvedValueOnce(MOCK_PRODUCTO)
      .mockResolvedValueOnce(MOCK_LIBERA)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ saldo: 10 }]);

    const res2 = await POST_ITEM(makeReq(BASE_BODY), ctx);
    expect(res2.status).toBe(400);
  });

  it('R3: UPDATE ubicaciones_bodega, no INSERT', async () => {
    happyPath();
    const res = await POST_ITEM(makeReq(BASE_BODY), ctx);
    expect(res.status).toBe(200);

    const ubCall = sql.mock.calls[4][0].join('');
    expect(ubCall).toMatch(/UPDATE.*ubicaciones_bodega/i);
    expect(ubCall).not.toMatch(/INSERT/i);
    expect(ubCall).toMatch(/saldo\s*=\s*saldo\s*-/i);
    expect(sql.mock.calls[4][1]).toBe(20);
  });

  it('si la liberación falla, el POST falla y no descuenta stock', async () => {
    sql
      .mockResolvedValueOnce(MOCK_ACTIVA)
      .mockResolvedValueOnce(MOCK_PRODUCTO)
      .mockRejectedValueOnce(new Error('db caida'));

    await expect(POST_ITEM(makeReq(BASE_BODY), ctx)).rejects.toThrow('db caida');
    expect(sql.mock.calls.some((c: any[]) =>
      c[0].join('').includes('UPDATE public.productos'))).toBe(false);
  });

  it('sin sesion → 401', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST_ITEM(makeReq(BASE_BODY), ctx);
    expect(res.status).toBe(401);
  });

  it('bodeguero → 403', async () => {
    getServerSession.mockResolvedValue({ user: { rol: 'bodeguero' } });
    const res = await POST_ITEM(makeReq(BASE_BODY), ctx);
    expect(res.status).toBe(403);
  });
});
