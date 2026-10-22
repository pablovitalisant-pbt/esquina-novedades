/**
 * @jest-environment node
 *
 * Fase B — Slice 35b (Reembolso): POST /api/notas-venta/[id]/reembolsar
 *
 * Contrato Fase A — Opción A (mitigación TOCTOU con guard 1/COUNT en transaction)
 *
 * TT1  — 1 pago USD               → 200, fidelidad cuenta_id/moneda/monto
 * TT1b — 2 pagos (USD+ARS)        → 200, 1 reembolso por pago original
 * TT2  — Sin pagos registrados    → 400 { error: 'SIN_PAGOS', ... }
 * TT3  — TOCTOU (suma cambió)     → 409 { error: 'ESTADO_MODIFICADO', ... }
 * TT4  — Error de DB inesperado   → 500 (no enmascarar como 409)
 *
 * El guard usa sql.transaction() con 1/COUNT(*) — si COUNT=0 → 1/0 → rollback.
 * code 22012 = division by zero → handler retorna 409.
 * code distinto → handler retorna 500.
 */

import { NextRequest } from 'next/server';

const getServerSession = jest.fn();
const sql = jest.fn();
const sqlTransaction = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('@/lib/db', () => {
  const mockSql = (...args: any[]) => sql(...args);
  mockSql.transaction = (...args: any[]) => sqlTransaction(...args);
  return { sql: mockSql };
});

const ADMIN = { user: { id: '7', rol: 'admin', nombre: 'Admin' } };

beforeEach(() => {
  jest.clearAllMocks();
});

async function getPOST() {
  const mod = await import('@/app/api/notas-venta/[id]/reembolsar/route');
  return mod.POST;
}

// ═══════════════════════════════════════════════════════════════════════
// TT1 — 1 pago USD
// ═══════════════════════════════════════════════════════════════════════
describe('TT1 — POST /api/notas-venta/[id]/reembolsar 1 pago', () => {
  it('ROJO: debe replicar cuenta_id, moneda y monto del pago original', async () => {
    getServerSession.mockResolvedValue(ADMIN);

    sql.mockResolvedValueOnce([{
      monto_aplicado: '1500.00', movimiento_id: 2, cuenta_id: 1,
      moneda: 'USD', monto: 1500, monto_usd: 1500, tipo_cambio: null,
      forma_pago: 'efectivo', kcodcli2: null, nombre_cliente: null,
    }]);

    sqlTransaction.mockResolvedValueOnce([
      [{ id: 4 }],   // lock FOR UPDATE (punto 2)
      [{ guard: 1 }],
      [{ movimiento_id: 10, cuenta_id: 1, moneda: 'USD', monto: 1500 }],
      [],   // UPDATE productos (stock, sin items)
      [],   // UPDATE ubicaciones_bodega (stock)
      [],   // UPDATE estado
    ]);

    const POST = await getPOST();
    const res = await POST(
      new NextRequest('http://localhost/api/notas-venta/4/reembolsar', {
        method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '4' }) }
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.estado).toBe('anulada');
    expect(body.reembolsos.length).toBe(1);
    expect(body.reembolsos[0].cuenta_id).toBe(1);
    expect(body.reembolsos[0].moneda).toBe('USD');
    expect(body.reembolsos[0].monto).toBe(1500);
    expect(body.total_pagos_reembolsados).toBe(1500);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TT1b — 2 pagos (USD + ARS)
// ═══════════════════════════════════════════════════════════════════════
describe('TT1b — POST /api/notas-venta/[id]/reembolsar multi-pago', () => {
  it('ROJO: debe generar 1 reembolso por cada pago original', async () => {
    getServerSession.mockResolvedValue(ADMIN);

    sql.mockResolvedValueOnce([
      { monto_aplicado: '1000.00', movimiento_id: 2, cuenta_id: 1, moneda: 'USD', monto: 1000, monto_usd: 1000, tipo_cambio: null, forma_pago: 'efectivo', kcodcli2: null, nombre_cliente: null },
      { monto_aplicado: '500.00', movimiento_id: 5, cuenta_id: 2, moneda: 'ARS', monto: 750000, monto_usd: 500, tipo_cambio: 980.5, forma_pago: 'transferencia', kcodcli2: null, nombre_cliente: null },
    ]);

    sqlTransaction.mockResolvedValueOnce([
      [{ id: 4 }],   // lock FOR UPDATE (punto 2)
      [{ guard: 1 }],
      [{ movimiento_id: 11, cuenta_id: 1, moneda: 'USD', monto: 1000 }],
      [{ movimiento_id: 12, cuenta_id: 2, moneda: 'ARS', monto: 750000 }],
      [],   // UPDATE productos (stock)
      [],   // UPDATE ubicaciones_bodega (stock)
      [],   // UPDATE estado
    ]);

    const POST = await getPOST();
    const res = await POST(
      new NextRequest('http://localhost/api/notas-venta/4/reembolsar', {
        method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '4' }) }
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.reembolsos.length).toBe(2);
    expect(body.reembolsos[0].cuenta_id).toBe(1);
    expect(body.reembolsos[0].moneda).toBe('USD');
    expect(body.reembolsos[1].cuenta_id).toBe(2);
    expect(body.reembolsos[1].moneda).toBe('ARS');
    expect(body.total_pagos_reembolsados).toBe(1500);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TT2 — Sin pagos
// ═══════════════════════════════════════════════════════════════════════
describe('TT2 — POST /api/notas-venta/[id]/reembolsar sin pagos', () => {
  it('ROJO: debe devolver 400 SIN_PAGOS sin llamar a transaction', async () => {
    getServerSession.mockResolvedValue(ADMIN);

    sql.mockResolvedValueOnce([]);

    const POST = await getPOST();
    const res = await POST(
      new NextRequest('http://localhost/api/notas-venta/5/reembolsar', {
        method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '5' }) }
    );

    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('SIN_PAGOS');
    expect(sqlTransaction).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TT3 — TOCTOU: guard 1/COUNT dispara division by zero
// ═══════════════════════════════════════════════════════════════════════
describe('TT3 — POST /api/notas-venta/[id]/reembolsar TOCTOU', () => {
  it('ROJO: code 22012 debe devolver 409 ESTADO_MODIFICADO', async () => {
    getServerSession.mockResolvedValue(ADMIN);

    sql.mockResolvedValueOnce([{
      monto_aplicado: '100.00', movimiento_id: 3, cuenta_id: 1,
      moneda: 'USD', monto: 100, monto_usd: 100, tipo_cambio: null,
      forma_pago: 'efectivo', kcodcli2: null, nombre_cliente: null,
    }]);
    sql.mockResolvedValueOnce([]);  // itemGroups (sin items)

    const err = new Error('division by zero');
    (err as any).code = '22012';
    sqlTransaction.mockRejectedValueOnce(err);

    const POST = await getPOST();
    const res = await POST(
      new NextRequest('http://localhost/api/notas-venta/6/reembolsar', {
        method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '6' }) }
    );

    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toBe('ESTADO_MODIFICADO');
    expect(body.mensaje).toContain('reintentar');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TT4 — Error de DB inesperado (code distinto de 22012)
// ═══════════════════════════════════════════════════════════════════════
describe('TT4 — POST /api/notas-venta/[id]/reembolsar error DB', () => {
  it('ROJO: code != 22012 debe devolver 500', async () => {
    getServerSession.mockResolvedValue(ADMIN);

    sql.mockResolvedValueOnce([{
      monto_aplicado: '300.00', movimiento_id: 4, cuenta_id: 2,
      moneda: 'USD', monto: 300, monto_usd: 300, tipo_cambio: null,
      forma_pago: 'transferencia', kcodcli2: null, nombre_cliente: null,
    }]);

    const err = new Error('connection terminated unexpectedly');
    (err as any).code = '08006';
    sqlTransaction.mockRejectedValueOnce(err);

    const POST = await getPOST();
    const res = await POST(
      new NextRequest('http://localhost/api/notas-venta/7/reembolsar', {
        method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '7' }) }
    );

    expect(res.status).toBe(500);
    expect(res.status).not.toBe(409);
  });
});
