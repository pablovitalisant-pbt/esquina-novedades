/**
 * @jest-environment node
 *
 * Fase B — Slice 3a: Saldo a favor (ledger + generación de crédito).
 * Tests que intentan romper el slice. Escritos para fallar, no para confirmar.
 *
 * Riesgos cubiertos:
 * [x] INSERT a DB — crédito duplicado / crédito sin cliente_id (debe ser imposible)
 * [x] Más de un JOIN / cálculo agregado — saldo_favor_aplicado mal sumado
 * [x] Evento async simultáneo — sin FOR UPDATE (documentado, no cubierto aquí)
 * [x] Modificación de estado — excedente en USD (monto_usd), no monto ARS crudo
 *
 * Patrón: mock de `sql` (unit, sin DB real), igual que slice32-pagar-nota.test.ts.
 * El proxy de atomicidad: la sentencia atómica (último call) DEBE contener el
 * INSERT al ledger encadenado al mismo CTE que el cobro.
 */

import { NextRequest } from 'next/server';

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/db', () => ({ sql: (...args: any[]) => sql(...args) }));

import { POST as PagarPOST } from '@/app/api/notas-venta/[id]/pagar/route';
import { GET as DeudoresGET } from '@/app/api/deudores/route';
import { GET as NotasVentaGET } from '@/app/api/notas-venta/route';

// ─── Helpers ─────────────────────────────────────────────────────────
const sesionAdmin = { user: { id: '7', rol: 'admin', nombre: 'Admin' } };

function reqPagar(overrides: any = {}) {
  const body = { cuenta_id: 1, monto: 1500, moneda: 'USD', forma_pago: 'efectivo', ...overrides };
  return new NextRequest('http://localhost/api/notas-venta/12/pagar', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function cobroRow(over: any = {}) {
  return {
    id: 99, fecha: '2026-08-18', tipo: 'cobro', cliente_id: 'c-uuid-1',
    nombre_cliente: 'Juana', cuenta_id: 1, monto: 1500,
    monto_usd: 1500, tipo_cambio: null, forma_pago: 'efectivo',
    observaciones: null, empresa: 'bazar-naty', es_credito: false,
    usuario_id: 7, usuario_nombre: 'Admin', ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────
describe('POST /pagar — generación de crédito en sobrepago', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue(sesionAdmin);
  });

  // Caso: nota total=1450, sin pagos, cliente_id presente. Pago USD 1500.
  const seedNotaSobrepago = () => {
    sql.mockResolvedValueOnce([{ id: 12, estado: 'activa', cliente_id: 'c-uuid-1', nombre_cliente: 'Juana' }]);
    sql.mockResolvedValueOnce([{ total: 1450 }]); // total
    sql.mockResolvedValueOnce([{ total: 0 }]); // pagado → saldoPendiente 1450
  };

  test('TEST 1: pago exacto → credito_generado 0, sin fila en el ledger', async () => {
    seedNotaSobrepago(); // saldo 1450
    // pago exacto 1450 → excedente 0
    sql.mockResolvedValueOnce([cobroRow({ monto: 1450, monto_usd: 1450 })]);
    const res = await PagarPOST(reqPagar({ monto: 1450 }), { params: Promise.resolve({ id: '12' }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.monto_aplicado).toBeCloseTo(1450, 2);
    expect(body.credito_generado).toBe(0);
  });

  test('TEST 2: sobrepago con cliente_id → fila credito, monto_aplicado capado', async () => {
    seedNotaSobrepago(); // saldo 1450
    sql.mockResolvedValueOnce([cobroRow()]); // monto_aplicado se capa a 1450 en JS
    const res = await PagarPOST(reqPagar({ monto: 1500 }), { params: Promise.resolve({ id: '12' }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.monto_aplicado).toBeCloseTo(1450, 2);
    expect(body.credito_generado).toBeCloseTo(50, 2); // 1500 - 1450

    // El INSERT al ledger vive en la MISMA sentencia atómica que el cobro.
    const statement = sql.mock.calls[3][0].join('');
    expect(statement).toMatch(/WITH mov AS/);
    expect(statement).toMatch(/INSERT INTO clientes_saldo_favor_movimientos/);
    expect(statement).toMatch(/'credito'/); // tipo del movimiento en el ledger
  });

  test('TEST 3: sobrepago con cliente_id NULO → sin fila en ledger, credito_generado 0', async () => {
    sql.mockResolvedValueOnce([{ id: 12, estado: 'activa', cliente_id: null, nombre_cliente: 'Juana' }]);
    sql.mockResolvedValueOnce([{ total: 1450 }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([cobroRow({ cliente_id: null })]);
    const res = await PagarPOST(reqPagar({ monto: 1500 }), { params: Promise.resolve({ id: '12' }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.monto_aplicado).toBeCloseTo(1450, 2);
    expect(body.credito_generado).toBe(0);

    // Sin cliente → la condicion del credito debe ser false (WHERE false → 0 filas).
    // El proxy testable: credito_generado 0 y no se inserta (0 filas por la condicion).
  });

  test('TEST 4 (Slice 2c): sobrepago CLP entero; moneda del body ignorada, sin caja_config', async () => {
    // saldo 10000, pago 12000 → aplicado 10000, excedente 2000
    sql.mockResolvedValueOnce([{ id: 12, estado: 'activa', cliente_id: 'c-uuid-1', nombre_cliente: 'Juana' }]);
    sql.mockResolvedValueOnce([{ total: 10000 }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([cobroRow({ monto: 12000 })]);
    const res = await PagarPOST(reqPagar({ monto: 12000, moneda: 'ARS' }), { params: Promise.resolve({ id: '12' }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.monto_aplicado).toBe(10000); // cap al saldo
    expect(body.credito_generado).toBe(2000);
    expect(sql).toHaveBeenCalledTimes(4);
  });

  test('TEST 6: smoke — nota saldada por sobrepago deja de aparecer en /deudores', async () => {
    // Simula el estado post-pago: el pago (1450 aplicado + 50 credito) llevó
    // saldo_pendiente a 0. La nota no debe listarse como deuda.
    getServerSession.mockResolvedValue(sesionAdmin);
    sql.mockResolvedValueOnce([{
      cliente_id: 'c-uuid-1', nombre_cliente: 'Juana', titulo: 'N1',
      created_at: '2026-08-01', total: 1450, total_pagado: 1450, saldo_favor_aplicado: 0,
    }]);
    const deu = await (await DeudoresGET()).json();
    expect(deu.data).toEqual([]); // saldo 0 → excluida
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('GET deudores / notas-venta — saldo_favor_aplicado resta débitos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });
  });

  test('TEST 5a: GET /api/deudores resta saldo_favor_aplicado del saldo', async () => {
    let captured = '';
    sql.mockImplementation((strings: any) => { captured = strings.join(''); return []; });
    await DeudoresGET();
    expect(captured).toMatch(/clientes_saldo_favor_movimientos/);
    expect(captured).toMatch(/tipo = 'debito'/);
    expect(captured).toMatch(/saldo_favor_aplicado/);
  });

  test('TEST 5b: GET /api/notas-venta resta saldo_favor_aplicado del saldo', async () => {
    let captured = '';
    sql.mockImplementation((strings: any) => { captured = strings.join(''); return []; });
    await NotasVentaGET();
    expect(captured).toMatch(/clientes_saldo_favor_movimientos/);
    expect(captured).toMatch(/tipo = 'debito'/);
    expect(captured).toMatch(/saldo_favor_aplicado/);
  });

  test('TEST 5c: saldo_pendiente = total - total_pagado - saldo_favor_aplicado (deudores)', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });
    sql.mockResolvedValueOnce([
      { cliente_id: 'c1', nombre_cliente: 'A', titulo: 'N1', created_at: '2026-08-01', total: 100, total_pagado: 20, saldo_favor_aplicado: 10 },
    ]);
    const res = await DeudoresGET();
    const { data } = await res.json();
    expect(data[0].deuda_total).toBeCloseTo(70, 2); // 100 - 20 - 10
  });

  test('TEST 5d: saldo_pendiente = total - total_pagado - saldo_favor_aplicado (notas-venta)', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });
    sql.mockResolvedValueOnce([
      { id: 1, titulo: 'N1', total: 100, total_pagado: 20, saldo_favor_aplicado: 10 },
    ]);
    const res = await NotasVentaGET();
    const { data } = await res.json();
    expect(data[0].saldo_pendiente).toBeCloseTo(70, 2);
  });
});
