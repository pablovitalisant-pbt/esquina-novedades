/**
 * @jest-environment node
 *
 * Fase B — Slice 35c (Anular): DELETE handler + listado + filtros
 *
 * Contrato Sub-slice 3:
 * - DELETE con pagos (SUM > 0) → 409 structurado, sin tocar DB
 * - DELETE sin pagos (SUM = 0) → UPDATE estado='anulada' (no DELETE FROM)
 * - Ambos caminos NO filtran por usuario_id (notas compartidas, slice notas-venta-compartidas)
 * - GET /api/notas-venta → WHERE estado != 'anulada', ORDER BY estado ASC
 *
 * TT1 — DELETE con pagos  → 409 { error: 'PAGO_REGISTRADO', ... }
 * TT3 — DELETE sin pagos  → UPDATE estado='anulada' (no DELETE FROM)
 * TT4 — GET /api/notas-venta → WHERE estado != 'anulada'
 *
 * Los 3 tests son ROJOS hoy, VERDES después de Sub-slice 3.
 */

import { NextRequest } from 'next/server';

// ── Mocks ─────────────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════
// TT1 — DELETE con pagos existentes (SUM > 0 → 409 sin UPDATE/DELETE)
// ═══════════════════════════════════════════════════════════════════════
describe('TT1 — DELETE /api/notas-venta/[id] con movimientos de caja', () => {
  it('ROJO: debe devolver 409 structurado y NO hacer UPDATE/DELETE', async () => {
    const { DELETE } = await import('@/app/api/notas-venta/[id]/route');

    getServerSession.mockResolvedValue(ADMIN);

    // Mock: SUM(monto_aplicado) > 0 → hay pagos registrados para esta nota
    // El handler filtra por usuario_id internamente (via JOIN con prenotas)
    sql.mockResolvedValueOnce([{ total: '1500.00' }]);

    const res = await DELETE(
      new NextRequest('http://localhost/api/notas-venta/4', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '4' }) }
    );

    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toBe('PAGO_REGISTRADO');
    expect(body.monto_pagado).toBe(1500);
    expect(body.prenota_id).toBe(4);

    // Solo debe haber UNA llamada a sql (la lectura de SUM)
    expect(sql.mock.calls.length).toBe(1);

    // La query NO debe filtrar por usuario_id (notas compartidas)
    const sqlText = String(sql.mock.calls[0][0]);
    expect(sqlText).not.toContain('usuario_id');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TT3 — DELETE sin pagos (SUM = 0 → UPDATE, no DELETE)
// ═══════════════════════════════════════════════════════════════════════
describe('TT3 — DELETE /api/notas-venta/[id] sin pagos', () => {
  it('ROJO: debe hacer UPDATE estado="anulada" en vez de DELETE FROM, con bloqueo de fila', async () => {
    const { DELETE } = await import('@/app/api/notas-venta/[id]/route');

    getServerSession.mockResolvedValue(ADMIN);

    // Para inspeccionar el SQL de la transaccion, sql devuelve {strings, values}.
    sql.mockImplementation((strings: any, ...values: any) => ({ strings, values }));
    // SUM = 0 (sin pagos) — mockResolvedValueOnce tiene prioridad sobre el implementation.
    sql.mockResolvedValueOnce([{ total: '0' }]);
    sqlTransaction.mockResolvedValueOnce([
      [{ id: 5 }],  // lock FOR UPDATE
      [{ id: 5 }],  // UPDATE estado RETURNING id
      [],           // UPDATE productos (stock, no-op sin items)
      [],           // UPDATE ubicaciones_bodega
    ]);

    await DELETE(
      new NextRequest('http://localhost/api/notas-venta/5', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '5' }) }
    );

    const txQueries = sqlTransaction.mock.calls[0][0];
    const allText = txQueries.map((q: any) => q.strings.join('')).join('\n');

    // Verde después: no debe haber DELETE FROM en ningún query de la transaccion
    expect(allText).not.toMatch(/DELETE FROM/i);

    // Debe haber un UPDATE que setee estado='anulada'
    // (regex precisa: "FOR UPDATE" del lock contiene "UPDATE" y no debe matchear)
    const updateCall = txQueries.find((q: any) => /UPDATE\s+public\.prenotas/i.test(q.strings.join('')));
    expect(updateCall).toBeDefined();
    const updateText = updateCall.strings.join('');
    expect(updateText).toContain('estado');
    expect(updateText).toContain('anulada');
    expect(updateText).not.toContain('usuario_id');

    // La primera query de la transaccion es el lock FOR UPDATE (anti doble-restore)
    expect(txQueries[0].strings.join('')).toMatch(/FOR UPDATE/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TT4 — GET /api/notas-venta lista
// ═══════════════════════════════════════════════════════════════════════
describe('TT4 — GET /api/notas-venta excluye anuladas', () => {
  it('ROJO: el SQL debe incluir WHERE estado != "anulada" y ORDER BY estado ASC', async () => {
    const { GET } = await import('@/app/api/notas-venta/route');

    getServerSession.mockResolvedValue(ADMIN);

    sql.mockResolvedValueOnce([]);

    const res = await GET();
    expect(res.status).toBe(200);

    const calls = sql.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);

    const sqlString = String(calls[0][0]);

    // ROJO hoy: no menciona 'estado' → falla
    // Verde después: incluye estado != 'anulada' y ORDER BY estado
    expect(sqlString).toContain('estado');
    expect(sqlString).toContain('anulada');

    // El ORDER BY debe incluir estado
    expect(sqlString.toUpperCase()).toContain('ORDER BY');
    expect(sqlString).toContain('estado');
  });
});
