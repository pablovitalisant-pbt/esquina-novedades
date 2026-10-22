/**
 * @jest-environment node
 *
 * Fase B — Slice 1: PATCH /api/notas-venta/[id]/items/[itemId] — ajuste de stock.
 * R4 (cantidad invalida), R7 (estado de nota).
 * Casos: delta>0, delta<0, delta=0.
 */

import { NextRequest } from 'next/server';
import { PATCH as PATCH_ITEM } from '@/app/api/notas-venta/[id]/items/[itemId]/route';

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sql(...args),
}));

const makeReq = (body: any) => new NextRequest('http://localhost', {
  method: 'PATCH', body: JSON.stringify(body),
});

// Handler SQL sequence for PATCH:
// 1. checkNotaActiva: SELECT estado FROM prenotas
// 2. Leer item actual: SELECT unidades, codigo, empresa_id FROM prenota_items
// 3. Si delta>0: UPDATE productos RETURNING saldo (+ fallback SELECT si 0 filas)
//    Si delta<0: UPDATE productos (solo suma)
// 4. Si delta!=0: UPDATE ubicaciones_bodega
// 5. UPDATE prenota_items SET cajas, unidades, precio RETURNING *

describe('PATCH /api/notas-venta/[id]/items/[itemId] — ajuste de stock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'vendedor', empresas: [1] } });
  });

  // ═══════════════════════════════════════════════════════════════
  // R7: Estado de nota
  // ═══════════════════════════════════════════════════════════════
  it('R7: nota anulada → 422', async () => {
    sql.mockResolvedValueOnce([{ estado: 'anulada' }]);
    const res = await PATCH_ITEM(makeReq({ unidades: 15 }), { params: Promise.resolve({ id: '1', itemId: '5' }) });
    expect(res.status).toBe(422);
    expect(sql.mock.calls.length).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════
  // delta > 0
  // ═══════════════════════════════════════════════════════════════
  it('delta positivo + stock suficiente → UPDATE descuenta', async () => {
    sql
      .mockResolvedValueOnce([{ estado: 'activa' }])   // 1. checkNotaActiva
      .mockResolvedValueOnce([{ unidades: 10, codigo: 'PROD-01', empresa_id: 1 }]) // 2. leer item
      .mockResolvedValueOnce([{ saldo: 100 }]);         // 3. UPDATE stock delta=5

    sql.mockResolvedValueOnce([]);                       // 4. UPDATE ub_bodega
    sql.mockResolvedValueOnce([{ id: 5, unidades: 15 }]); // 5. UPDATE prenota_items

    const res = await PATCH_ITEM(makeReq({ unidades: 15 }), { params: Promise.resolve({ id: '1', itemId: '5' }) });
    expect(res.status).toBe(200);

    const updateCall = sql.mock.calls[2][0].join('');
    expect(updateCall).toMatch(/UPDATE.*productos.*saldo\s*=\s*saldo\s*-/i);
    expect(sql.mock.calls[2][1]).toBe(5);   // delta = 15 - 10
    expect(sql.mock.calls[2][4]).toBe(5);   // mismo valor en saldo >=
  });

  it('delta positivo + stock insuficiente → 400', async () => {
    sql
      .mockResolvedValueOnce([{ estado: 'activa' }])
      .mockResolvedValueOnce([{ unidades: 10, codigo: 'PROD-01', empresa_id: 1 }])
      .mockResolvedValueOnce([])                         // UPDATE 0 filas
      .mockResolvedValueOnce([{ saldo: 3 }]);             // fallback SELECT

    const res = await PATCH_ITEM(makeReq({ unidades: 15 }), { params: Promise.resolve({ id: '1', itemId: '5' }) });
    expect(res.status).toBe(400);
  });

  // ═══════════════════════════════════════════════════════════════
  // delta < 0
  // ═══════════════════════════════════════════════════════════════
  it('delta negativo → suma stock de vuelta', async () => {
    sql
      .mockResolvedValueOnce([{ estado: 'activa' }])
      .mockResolvedValueOnce([{ unidades: 20, codigo: 'PROD-01', empresa_id: 1 }])
      .mockResolvedValueOnce([{ saldo: 100 }]);           // UPDATE productos suma 10

    sql.mockResolvedValueOnce([]);                         // UPDATE ub_bodega
    sql.mockResolvedValueOnce([{ id: 5, unidades: 10 }]); // UPDATE prenota_items

    const res = await PATCH_ITEM(makeReq({ unidades: 10 }), { params: Promise.resolve({ id: '1', itemId: '5' }) });
    expect(res.status).toBe(200);

    const updateCall = sql.mock.calls[2][0].join('');
    expect(updateCall).toMatch(/UPDATE.*productos.*saldo\s*=\s*saldo\s*\+/i);
    expect(sql.mock.calls[2][1]).toBe(10);  // -delta = -(-10) = 10, suma de vuelta
  });

  // ═══════════════════════════════════════════════════════════════
  // delta = 0
  // ═══════════════════════════════════════════════════════════════
  it('delta = 0 → no toca stock', async () => {
    sql
      .mockResolvedValueOnce([{ estado: 'activa' }])
      .mockResolvedValueOnce([{ unidades: 10, codigo: 'PROD-01', empresa_id: 1 }]);

    sql.mockResolvedValueOnce([{ id: 5, unidades: 10 }]); // UPDATE prenota_items (sin stock)

    const res = await PATCH_ITEM(makeReq({ unidades: 10 }), { params: Promise.resolve({ id: '1', itemId: '5' }) });
    expect(res.status).toBe(200);
  });

  // ═══════════════════════════════════════════════════════════════
  // R4: cantidad invalida
  // ═══════════════════════════════════════════════════════════════
  it('R4: unidades = 0 → 400, sin tocar DB', async () => {
    const res = await PATCH_ITEM(makeReq({ unidades: 0 }), { params: Promise.resolve({ id: '1', itemId: '5' }) });
    expect(res.status).toBe(400);
    expect(sql.mock.calls.length).toBe(0);
  });

  it('R4: unidades negativas → 400, sin tocar DB', async () => {
    const res = await PATCH_ITEM(makeReq({ unidades: -5 }), { params: Promise.resolve({ id: '1', itemId: '5' }) });
    expect(res.status).toBe(400);
    expect(sql.mock.calls.length).toBe(0);
  });

  it('R4: unidades no numerico → 400, sin tocar DB', async () => {
    const res = await PATCH_ITEM(makeReq({ unidades: 'abc' }), { params: Promise.resolve({ id: '1', itemId: '5' }) });
    expect(res.status).toBe(400);
    expect(sql.mock.calls.length).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════
  // Sin unidades en body
  // ═══════════════════════════════════════════════════════════════
  it('sin unidades en body → no toca stock', async () => {
    sql
      .mockResolvedValueOnce([{ estado: 'activa' }])
      .mockResolvedValueOnce([{ unidades: 10, codigo: 'PROD-01', empresa_id: 1 }]);

    sql.mockResolvedValueOnce([{ id: 5, unidades: 10 }]); // UPDATE prenota_items (solo precio)

    const res = await PATCH_ITEM(makeReq({ precio: 15 }), { params: Promise.resolve({ id: '1', itemId: '5' }) });
    expect(res.status).toBe(200);
  });

  // ═══════════════════════════════════════════════════════════════
  // Auth (safety net)
  // ═══════════════════════════════════════════════════════════════
  it('sin sesion → 401', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await PATCH_ITEM(makeReq({ unidades: 10 }), { params: Promise.resolve({ id: '1', itemId: '5' }) });
    expect(res.status).toBe(401);
  });

  it('bodeguero → 403', async () => {
    getServerSession.mockResolvedValue({ user: { rol: 'bodeguero' } });
    const res = await PATCH_ITEM(makeReq({ unidades: 10 }), { params: Promise.resolve({ id: '1', itemId: '5' }) });
    expect(res.status).toBe(403);
  });
});
