/**
 * @jest-environment node
 *
 * Fase B — Slice 1: POST /api/notas-venta/[id]/items — reserva de stock.
 * R1 (concurrencia), R3 (ub_bodega), R4 (cantidad invalida), R6 (unidades como unica fuente),
 * R7 (estado de nota).
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

const BASE_BODY = { codigo: 'PROD-01', descripcion: 'Producto test', empresa_id: 1, cajas: 2, unidades: 20, precio: 10 };

// Secuencia de SQL calls en handler real (Slice 8c suma la liberación perezosa):
// 1. SELECT estado FROM prenotas
// 2. CTE liberarReservasVencidas()
// 3. UPDATE productos RETURNING saldo
// 4. UPDATE ubicaciones_bodega (solo happy path)
// 5. INSERT INTO prenota_items RETURNING *
// 6. UPDATE prenotas SET updated_at

const MOCK_ACTIVA = [{ estado: 'activa' }];
const MOCK_LIBERA = [{ liberados: 0, unidades: 0 }];
const MOCK_STOCK_OK = [{ saldo: 80 }];
const MOCK_INSERT_OK = [{ id: 1, codigo: 'PROD-01', unidades: 20 }];

describe('POST /api/notas-venta/[id]/items — reserva de stock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'vendedor', empresas: [1] } });
  });

  // ═══════════════════════════════════════════════════════════════
  // R7: Estado de nota
  // ═══════════════════════════════════════════════════════════════
  it('R7: nota anulada → 422, no descuenta stock', async () => {
    sql.mockResolvedValueOnce([{ estado: 'anulada' }]);
    const res = await POST_ITEM(makeReq(BASE_BODY), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(422);
    expect(sql.mock.calls.length).toBe(1);
  });

  it('nota activa + stock suficiente → 200, UPDATE e INSERT ejecutados', async () => {
    sql
      .mockResolvedValueOnce(MOCK_ACTIVA)    // 1. estado
      .mockResolvedValueOnce(MOCK_LIBERA)    // 2. liberación perezosa
      .mockResolvedValueOnce(MOCK_STOCK_OK)  // 3. UPDATE stock
      .mockResolvedValueOnce([])              // 4. UPDATE ub_bodega
      .mockResolvedValueOnce(MOCK_INSERT_OK) // 5. INSERT item
      .mockResolvedValueOnce([]);              // 6. UPDATE prenotas

    const res = await POST_ITEM(makeReq(BASE_BODY), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);

    // Verificar template structure
    expect(sql.mock.calls[1][0].join('')).toMatch(/WITH\s+vencidos/i);
    const updateCall = sql.mock.calls[2][0].join('');
    expect(updateCall).toMatch(/UPDATE.*productos.*saldo\s*=\s*saldo\s*-/i);
    expect(updateCall).toMatch(/WHERE.*codigo/i);
    // Verificar valor interpolado real (no solo template)
    expect(sql.mock.calls[2][1]).toBe(20);   // cantidadTotal = unidades
    expect(sql.mock.calls[2][4]).toBe(20);   // mismo valor en saldo >=
  });

  // ═══════════════════════════════════════════════════════════════
  // R4: cantidad invalida
  // ═══════════════════════════════════════════════════════════════
  it('R4: unidades = 0 → 400, sin tocar DB', async () => {
    sql.mockResolvedValueOnce(MOCK_ACTIVA);
    const res = await POST_ITEM(makeReq({ ...BASE_BODY, unidades: 0 }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
    expect(sql.mock.calls.length).toBe(1);
  });

  it('R4: unidades negativo → 400', async () => {
    sql.mockResolvedValueOnce(MOCK_ACTIVA);
    const res = await POST_ITEM(makeReq({ ...BASE_BODY, unidades: -5 }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
    expect(sql.mock.calls.length).toBe(1);
  });

  it('R4: unidades no numerico → 400', async () => {
    sql.mockResolvedValueOnce(MOCK_ACTIVA);
    const res = await POST_ITEM(makeReq({ ...BASE_BODY, unidades: 'abc' }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
  });

  it('R4: unidades undefined → 400', async () => {
    sql.mockResolvedValueOnce(MOCK_ACTIVA);
    const { unidades, ...sinUnidades } = BASE_BODY;
    const res = await POST_ITEM(makeReq(sinUnidades), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
  });

  // ═══════════════════════════════════════════════════════════════
  // Stock insuficiente
  // ═══════════════════════════════════════════════════════════════
  it('stock insuficiente → 400, disponible y solicitado en respuesta', async () => {
    sql
      .mockResolvedValueOnce(MOCK_ACTIVA)   // 1. estado
      .mockResolvedValueOnce(MOCK_LIBERA)   // 2. liberación perezosa
      .mockResolvedValueOnce([])             // 3. UPDATE 0 filas
      .mockResolvedValueOnce([{ saldo: 5 }]); // 4. fallback SELECT

    const res = await POST_ITEM(makeReq(BASE_BODY), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/stock.*insuficiente/i);
    expect(body.disponible).toBe(5);
    expect(body.solicitado).toBe(20);
  });

  // ═══════════════════════════════════════════════════════════════
  // R1: Concurrencia
  // ═══════════════════════════════════════════════════════════════
  it('R1: dos requests simultaneos, el segundo ve saldo reducido', async () => {
    // Request 1: stock suficiente
    sql
      .mockResolvedValueOnce(MOCK_ACTIVA)
      .mockResolvedValueOnce(MOCK_LIBERA)      // liberación
      .mockResolvedValueOnce(MOCK_STOCK_OK)
      .mockResolvedValueOnce([])               // ub_bodega
      .mockResolvedValueOnce(MOCK_INSERT_OK)   // INSERT
      .mockResolvedValueOnce([]);               // prenotas

    const res1 = await POST_ITEM(makeReq(BASE_BODY), { params: Promise.resolve({ id: '1' }) });
    expect(res1.status).toBe(200);

    // Request 2: saldo restante 10, unidades 20 → insuficiente
    sql
      .mockResolvedValueOnce(MOCK_ACTIVA)      // estado
      .mockResolvedValueOnce(MOCK_LIBERA)      // liberación
      .mockResolvedValueOnce([])                // UPDATE 0 filas
      .mockResolvedValueOnce([{ saldo: 10 }]);  // fallback SELECT

    const res2 = await POST_ITEM(makeReq(BASE_BODY), { params: Promise.resolve({ id: '2' }) });
    expect(res2.status).toBe(400);
  });

  // ═══════════════════════════════════════════════════════════════
  // R3: Propagacion a ubicaciones_bodega
  // ═══════════════════════════════════════════════════════════════
  it('R3: UPDATE ubicaciones_bodega, no INSERT', async () => {
    sql
      .mockResolvedValueOnce(MOCK_ACTIVA)
      .mockResolvedValueOnce(MOCK_LIBERA)      // liberación
      .mockResolvedValueOnce(MOCK_STOCK_OK)
      .mockResolvedValueOnce([])               // ub_bodega
      .mockResolvedValueOnce(MOCK_INSERT_OK)
      .mockResolvedValueOnce([]);

    const res = await POST_ITEM(makeReq(BASE_BODY), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);

    const ubCall = sql.mock.calls[3][0].join('');
    expect(ubCall).toMatch(/UPDATE.*ubicaciones_bodega/i);
    expect(ubCall).not.toMatch(/INSERT/i);
    expect(ubCall).toMatch(/saldo\s*=\s*saldo\s*-/i);
    expect(sql.mock.calls[3][1]).toBe(20);   // mismo delta propagado
  });

  // ═══════════════════════════════════════════════════════════════
  // Auth (safety net)
  // ═══════════════════════════════════════════════════════════════
  it('si la liberación falla, el POST falla y no descuenta stock', async () => {
    sql
      .mockResolvedValueOnce(MOCK_ACTIVA)
      .mockRejectedValueOnce(new Error('db caida'));

    await expect(POST_ITEM(makeReq(BASE_BODY), { params: Promise.resolve({ id: '1' }) }))
      .rejects.toThrow('db caida');
    expect(sql.mock.calls.some((c: any[]) =>
      c[0].join('').includes('UPDATE public.productos'))).toBe(false);
  });

  it('sin sesion → 401', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST_ITEM(makeReq(BASE_BODY), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(401);
  });

  it('bodeguero → 403', async () => {
    getServerSession.mockResolvedValue({ user: { rol: 'bodeguero' } });
    const res = await POST_ITEM(makeReq(BASE_BODY), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(403);
  });
});
