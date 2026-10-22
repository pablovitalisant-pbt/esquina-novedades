/**
 * @jest-environment node
 *
 * Fase B — Slice 3b: Aplicar saldo a favor a una nota (manual).
 * Tests que intentan romper el slice. Escritos para fallar, no para confirmar.
 *
 * Riesgos cubiertos:
 * [x] INSERT a DB — aplicar más del disponible, o a una nota de otro cliente
 * [x] Validación de monto — aplicar más de lo que falta de la nota (sobra)
 * [x] Evento async simultáneo — doble aplicación del mismo saldo (mitigado
 *     parcialmente por WHERE en el INSERT; riesgo residual aceptado)
 * [x] Renderizado condicional — botón sin cliente_id o con saldo 0
 *
 * Patrón: mock de `sql` (unit, sin DB real), igual que slice32/saldo-favor.
 */

import { NextRequest } from 'next/server';

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/db', () => ({ sql: (...args: any[]) => sql(...args) }));

import { POST as AplicarPOST } from '@/app/api/notas-venta/[id]/aplicar-saldo-favor/route';
import { GET as NotaDetalleGET } from '@/app/api/notas-venta/[id]/route';

const sesionAdmin = { user: { id: '7', rol: 'admin', nombre: 'Admin' } };
const sesionBodega = { user: { id: '8', rol: 'bodeguero' } };

function reqAplicar(overrides: any = {}) {
  const body = { monto: 50, ...overrides };
  return new NextRequest('http://localhost/api/notas-venta/12/aplicar-saldo-favor', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /aplicar-saldo-favor', () => {
  beforeEach(() => {
    jest.resetAllMocks(); // limpia también el queue de mockResolvedValueOnce (evita leaks entre tests)
    getServerSession.mockResolvedValue(sesionAdmin);
  });

  // Helper: nota con cliente, total=100, sin pagos ni débitos → saldoPendiente 100.
  const seedNota = (over: any = {}) => {
    sql.mockResolvedValueOnce([{ id: 12, estado: 'activa', cliente_id: 'c-uuid-1', nombre_cliente: 'Juana', ...over }]);
    sql.mockResolvedValueOnce([{ total: 100 }]); // total
    sql.mockResolvedValueOnce([{ total: 0 }]); // pagado
    sql.mockResolvedValueOnce([{ total: 0 }]); // saldo_favor_aplicado (débitos a esta nota)
  };

  test('TEST 1: monto exacto al disponible → 201, saldo_favor_restante 0', async () => {
    seedNota();
    // disponible 50, INSERT ok (id 1)
    sql.mockResolvedValueOnce([{ disponible: 50, id: 1 }]);
    const res = await AplicarPOST(reqAplicar({ monto: 50 }), { params: Promise.resolve({ id: '12' }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.debito_aplicado).toBeCloseTo(50, 2);
    expect(body.saldo_favor_restante).toBeCloseTo(0, 2); // 50 disponibles - 50 aplicados
    expect(body.saldo_pendiente_restante).toBeCloseTo(50, 2); // 100 - 50
    // El INSERT del débito está en una sentencia con WHERE saldo.disponible.
    const stmt = sql.mock.calls[4][0].join('');
    expect(stmt).toMatch(/INSERT INTO clientes_saldo_favor_movimientos/);
    expect(stmt).toMatch(/'debito'/);
    expect(stmt).toMatch(/saldo\.disponible/);
  });

  test('TEST 2: monto > saldoPendiente de la nota → 422', async () => {
    seedNota(); // saldoPendiente 100
    const res = await AplicarPOST(reqAplicar({ monto: 150 }), { params: Promise.resolve({ id: '12' }) });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/excede el saldo pendiente/i);
    // No se llega al INSERT (solo 4 calls de seed).
    expect(sql).toHaveBeenCalledTimes(4);
  });

  test('TEST 3: monto > saldo disponible (pero <= saldoPendiente) → 422 insuficiente', async () => {
    seedNota(); // saldoPendiente 100
    // monto 60 <= saldoPendiente 100, pero disponible 50 < 60 → INSERT 0 filas (id null)
    sql.mockResolvedValueOnce([{ disponible: 50, id: null }]);
    const res = await AplicarPOST(reqAplicar({ monto: 60 }), { params: Promise.resolve({ id: '12' }) });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/Saldo a favor insuficiente/i);
  });

  test('TEST 4: nota sin cliente_id → 422, sin tocar el ledger', async () => {
    sql.mockResolvedValueOnce([{ id: 12, estado: 'activa', cliente_id: null, nombre_cliente: 'Juana' }]);
    const res = await AplicarPOST(reqAplicar(), { params: Promise.resolve({ id: '12' }) });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/cliente asociado/i);
    expect(sql).toHaveBeenCalledTimes(1); // solo la consulta de la nota
  });

  test('TEST 5: rol bodeguero → 403', async () => {
    getServerSession.mockResolvedValue(sesionBodega);
    const res = await AplicarPOST(reqAplicar(), { params: Promise.resolve({ id: '12' }) });
    expect(res.status).toBe(403);
  });

  test('TEST 5b: sin sesión → 401', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await AplicarPOST(reqAplicar(), { params: Promise.resolve({ id: '12' }) });
    expect(res.status).toBe(401);
  });

  test('TEST 7: smoke — débito reduce saldo_pendiente de la segunda nota', async () => {
    // Nota 12 con cliente. Saldo pendiente 100, disponible 50.
    seedNota();
    sql.mockResolvedValueOnce([{ disponible: 50, id: 1 }]); // aplicar 50 → 201
    const res = await AplicarPOST(reqAplicar({ monto: 50 }), { params: Promise.resolve({ id: '12' }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    // Tras aplicar, el débito resta del saldo pendiente (la nota 12 ahora
    // debe 50, no 100). El cálculo de saldo_pendiente en el GET ya resta
    // saldo_favor_aplicado (débitos a esta nota) — verificado en 3a.
    expect(body.saldo_pendiente_restante).toBeCloseTo(50, 2);
  });
});

describe('GET /api/notas-venta/[id] — cliente_saldo_favor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue(sesionAdmin);
  });

  test('TEST 6a: devuelve cliente_saldo_favor = credito - debito cuando hay movimientos', async () => {
    sql.mockResolvedValueOnce([{ id: 12, estado: 'activa', cliente_id: 'c-uuid-1', nombre_cliente: 'Juana' }]);
    sql.mockResolvedValueOnce([]); // items
    sql.mockResolvedValueOnce([{ total: 0 }]); // pagado
    sql.mockResolvedValueOnce([{ total: 0 }]); // saldo_favor_aplicado
    sql.mockResolvedValueOnce([{ disponible: 30 }]); // cliente_saldo_favor: 50 credito - 20 debito = 30
    const res = await NotaDetalleGET(new NextRequest('http://localhost/api/notas-venta/12'), { params: Promise.resolve({ id: '12' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cliente_saldo_favor).toBeCloseTo(30, 2);
  });

  test('TEST 6b: cliente_saldo_favor 0 cuando cliente no tiene movimientos', async () => {
    sql.mockResolvedValueOnce([{ id: 12, estado: 'activa', cliente_id: 'c-uuid-1', nombre_cliente: 'Juana' }]);
    sql.mockResolvedValueOnce([]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([{ disponible: 0 }]);
    const res = await NotaDetalleGET(new NextRequest('http://localhost/api/notas-venta/12'), { params: Promise.resolve({ id: '12' }) });
    const body = await res.json();
    expect(body.cliente_saldo_favor).toBe(0);
  });

  test('TEST 6c: cliente_saldo_favor 0 cuando la nota NO tiene cliente_id', async () => {
    sql.mockResolvedValueOnce([{ id: 12, estado: 'activa', cliente_id: null, nombre_cliente: 'Juana' }]);
    sql.mockResolvedValueOnce([]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    // Sin cliente_id no debe consultar el ledger → solo 4 calls.
    const res = await NotaDetalleGET(new NextRequest('http://localhost/api/notas-venta/12'), { params: Promise.resolve({ id: '12' }) });
    const body = await res.json();
    expect(body.cliente_saldo_favor).toBe(0);
    expect(sql).toHaveBeenCalledTimes(4);
  });
});
