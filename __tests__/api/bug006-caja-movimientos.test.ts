/**
 * @jest-environment node
 *
 * BUG-006 — Tests funcionales:
 * Test 1: POST con kcodcli2 persiste el valor (hoy: siempre null)
 * Test 2: imputación acepta prenota_id (hoy: knumfoli undefined → "ID inválido")
 */

import { NextRequest } from 'next/server';

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sql(...args),
}));

// ═══════════════════════════════════════════════════════════════════
// Test 1: POST con kcodcli2 persiste el valor
// ═══════════════════════════════════════════════════════════════════
describe('BUG-006 — POST /api/caja/movimientos con kcodcli2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persiste kcodcli2 cuando se envía en el body (hoy: Zod lo strippea → siempre null)', async () => {
    // Dynamic import para que los mocks se apliquen
    const { POST } = await import('@/app/api/caja/movimientos/route');

    getServerSession.mockResolvedValue({
      user: { id: '7', rol: 'admin', nombre: 'Admin' },
    });

    sql.mockResolvedValueOnce([{ valor: '1200' }]); // dolar_dia
    sql.mockResolvedValueOnce([
      {
        id: 1,
        fecha: '2026-07-04',
        tipo: 'cobro',
        kcodcli2: '5',
        nombre_cliente: 'Juan',
        cuenta_id: 1,
        moneda: 'USD',
        monto: 100,
        monto_usd: 100,
        tipo_cambio: null,
        forma_pago: 'transferencia',
        observaciones: null,
        empresa: 'bazar-naty',
        es_credito: false,
        usuario_id: 7,
        usuario_nombre: 'Admin',
      },
    ]);

    const req = new NextRequest('http://localhost/api/caja/movimientos', {
      method: 'POST',
      body: JSON.stringify({
        fecha: '2026-07-04',
        tipo: 'cobro',
        kcodcli2: '5', // UUID (string) desde 13a
        nombre_cliente: 'Juan',
        cuenta_id: 1,
        moneda: 'USD',
        monto: 100,
        forma_pago: 'transferencia',
        empresa: 'bazar-naty',
        es_credito: false,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);

    // Verificar que kcodcli2 llegó al INSERT (no fue strippeado por Zod)
    const insertCall = sql.mock.calls.find((c: any) =>
      c[0].join('').includes('INSERT INTO caja_movimientos')
    );
    expect(insertCall).toBeDefined();
    // El valor '5' (UUID string) debe aparecer en los arguments del INSERT
    const allValues = insertCall.slice(1);
    expect(allValues).toContain('5');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Test 2: imputación acepta prenota_id
// ═══════════════════════════════════════════════════════════════════
describe('BUG-006 — POST /api/caja/movimientos/[id]/notas con prenota_id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('acepta prenota_id sin fallar con "ID inválido" (hoy: knumfoli undefined → NaN → error)', async () => {
    const { POST: POST_NOTAS } = await import('@/app/api/caja/movimientos/[id]/notas/route');

    getServerSession.mockResolvedValue({
      user: { id: '7', rol: 'admin' },
    });

    // Mock: movimiento lookup
    sql.mockResolvedValueOnce([
      { kcodcli2: '5', monto_usd: '500', monto: '500', tipo: 'cobro', nombre_cliente: 'Juan' },
    ]);
    // Mock: nota validation (prenota existe para este cliente)
    sql.mockResolvedValueOnce([{ total: 1000 }]);
    // Mock: suma de imputaciones previas
    sql.mockResolvedValueOnce([{ total_imputado: 0 }]);
    // Mock: DELETE imputaciones previas
    sql.mockResolvedValueOnce([]);
    // Mock: INSERT en caja_movimiento_notas
    sql.mockResolvedValueOnce([{ id: 1, empresa: 'bazar-naty', knumfoli: '42', monto_aplicado: 50 }]);
    // Mock: recalculo monto_usd
    sql.mockResolvedValueOnce([{ total_imputado: 50 }]);

    const req = new NextRequest('http://localhost/api/caja/movimientos/1/notas', {
      method: 'POST',
      body: JSON.stringify({
        notas: [
          { prenota_id: 42, monto_aplicado: 50 },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST_NOTAS(req, { params: Promise.resolve({ id: '1' }) });

    // No debe ser 422 "ID inválido"
    expect(res.status).not.toBe(422);
    expect(res.status).toBe(201);
  });
});
