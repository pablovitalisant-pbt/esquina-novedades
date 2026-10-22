/**
 * @jest-environment node
 *
 * Fase B — Slice "Marcar como pagada": Tests que intentan romper
 *
 * Riesgos del checklist:
 * [✓] Renderizado condicional — botón/formulario condicionado a saldo_pendiente
 * [✓] INSERT o UPDATE a DB — dos INSERTs secuenciales, sin transacción
 * [✓] Evento asíncrono simultáneo — doble clic en "Confirmar pago"
 * [✓] Modificación de estado compartido — pago aparece en Caja Mayor
 *
 * Tests escritos para fallar, no para confirmar.
 * Fuerzan las condiciones exactas que rompen la lógica.
 *
 * La ruta no existe hasta Fase C — estos tests crashean con MODULE_NOT_FOUND
 * en rojo. Es el estado esperado.
 */

import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';

// ─── Mocks globales ────────────────────────────────────────────────
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

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ROUTE_PATH = 'app/api/notas-venta/[id]/pagar/route.ts';
const UI_PATH = 'app/(app)/notas-venta/[id]/client_page.tsx';

// Helper: import POST handler — fails until Fase C, that's the red signal
async function getPOST() {
  const mod = await import('@/app/api/notas-venta/[id]/pagar/route');
  return mod.POST;
}

// ═══════════════════════════════════════════════════════════════════
// Smoke — archivos existen con exports correctos
// ═══════════════════════════════════════════════════════════════════
describe('Smoke — archivos del slice existen', () => {
  test('nueva ruta /pagar existe', () => {
    const fullPath = path.join(PROJECT_ROOT, ROUTE_PATH);
    expect(fs.existsSync(fullPath)).toBe(true);
  });

  test('ruta /pagar exporta POST', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, ROUTE_PATH), 'utf-8');
    expect(content).toMatch(/\bPOST\b/);
  });

  test('client_page tiene boton "Marcar como pagada"', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, UI_PATH), 'utf-8');
    expect(content).toMatch(/Marcar como pagada|Pagar/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Auth guard
// ═══════════════════════════════════════════════════════════════════
describe('POST /api/notas-venta/[id]/pagar — auth', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('401 si no hay sesion', async () => {
    getServerSession.mockResolvedValue(null);
    const POST = await getPOST();
    const req = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
      method: 'POST',
      body: JSON.stringify({ cuenta_id: 1, monto: 100, moneda: 'USD', forma_pago: 'efectivo' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(401);
  });

  it('403 si rol bodeguero', async () => {
    getServerSession.mockResolvedValue({ user: { id: '5', rol: 'bodeguero' } });
    const POST = await getPOST();
    const req = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
      method: 'POST',
      body: JSON.stringify({ cuenta_id: 1, monto: 100, moneda: 'USD', forma_pago: 'efectivo' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Nota no existe → 404
// ═══════════════════════════════════════════════════════════════════
describe('POST /api/notas-venta/[id]/pagar — nota no existe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });
  });

  it('404 si nota no encontrada', async () => {
    const POST = await getPOST();
    sql.mockResolvedValueOnce([]);
    const req = new NextRequest('http://localhost/api/notas-venta/999/pagar', {
      method: 'POST',
      body: JSON.stringify({ cuenta_id: 1, monto: 100, moneda: 'USD', forma_pago: 'efectivo' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: '999' }) });
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════
// USD excede saldo → Slice 3a: se permite, se capa y genera crédito (201)
// ANTES (Slice 32): rechazaba con 422. El guard 422 quedó obsoleto por la
// feature "saldo a favor": el sobrepago ahora se capa al saldo pendiente
// y el excedente genera un crédito en el ledger (si hay cliente_id).
// Conducta previa testeada que cambió de forma deliberada — ver cierre 3a.
// ═══════════════════════════════════════════════════════════════════
describe('POST /api/notas-venta/[id]/pagar — USD excede saldo (sobrepago → crédito)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
  });

  it('201 con monto_aplicado capado y credito_generado cuando monto USD > saldo', async () => {
    const POST = await getPOST();
    sql.mockResolvedValueOnce([{ id: 1, estado: 'activa', cliente_id: 5, nombre_cliente: 'Juan' }]);
    sql.mockResolvedValueOnce([{ total: 100 }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([{
      id: 1, fecha: '2026-07-06', tipo: 'cobro', cliente_id: 5,
      nombre_cliente: 'Juan', cuenta_id: 1, moneda: 'USD', monto: 100.50,
      monto_usd: 100.50, tipo_cambio: null, forma_pago: 'efectivo',
      observaciones: null, empresa: 'bazar-naty', es_credito: false,
      usuario_id: 7, usuario_nombre: 'Admin', monto_aplicado: 100,
    }]);

    const req = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
      method: 'POST',
      body: JSON.stringify({ cuenta_id: 1, monto: 100.50, moneda: 'USD', forma_pago: 'efectivo' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.monto_aplicado).toBeCloseTo(100, 2); // capado al saldo
    expect(body.saldo_pendiente_restante).toBeCloseTo(0, 2);
    expect(body.credito_generado).toBeCloseTo(0.50, 2); // 100.50 - 100
  });

  it('201 y credito_generado 0 cuando cliente_id es NULO (excedente se capa en silencio)', async () => {
    const POST = await getPOST();
    sql.mockResolvedValueOnce([{ id: 1, estado: 'activa', cliente_id: null, nombre_cliente: 'Juan' }]);
    sql.mockResolvedValueOnce([{ total: 100 }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([{
      id: 1, fecha: '2026-07-06', tipo: 'cobro', cliente_id: null,
      nombre_cliente: 'Juan', cuenta_id: 1, moneda: 'USD', monto: 100.50,
      monto_usd: 100.50, tipo_cambio: null, forma_pago: 'efectivo',
      observaciones: null, empresa: 'bazar-naty', es_credito: false,
      usuario_id: 7, usuario_nombre: 'Admin', monto_aplicado: 100,
    }]);

    const req = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
      method: 'POST',
      body: JSON.stringify({ cuenta_id: 1, monto: 100.50, moneda: 'USD', forma_pago: 'efectivo' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.monto_aplicado).toBeCloseTo(100, 2);
    expect(body.credito_generado).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// ARS excede por redondeo → aceptado con cap
// ═══════════════════════════════════════════════════════════════════
describe('POST /api/notas-venta/[id]/pagar — ARS excede, se capa', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
  });

  it('201 con monto_aplicado capado cuando roundUpToHalf excede saldo', async () => {
    const POST = await getPOST();
    // Caso: saldo=10.33, dolar=980.5, ars=10129 → roundUpToHalf=10.50 > 10.33
    // Debe aceptar con monto_aplicado=10.33
    sql.mockResolvedValueOnce([{ id: 1, estado: 'activa', cliente_id: 5, nombre_cliente: 'Juan' }]);
    sql.mockResolvedValueOnce([{ total: 10.33 }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([{ valor: '980.5' }]);
    sql.mockResolvedValueOnce([{
      id: 1, fecha: '2026-07-06', tipo: 'cobro', cliente_id: 5,
      nombre_cliente: 'Juan', cuenta_id: 1, moneda: 'ARS', monto: 10129,
      monto_usd: 10.50, tipo_cambio: 980.5, forma_pago: 'efectivo',
      observaciones: null, empresa: 'bazar-naty', es_credito: false,
      usuario_id: 7, usuario_nombre: 'Admin', monto_aplicado: 10.33,
    }]);

    const req = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
      method: 'POST',
      body: JSON.stringify({ cuenta_id: 1, monto: 10129, moneda: 'ARS', forma_pago: 'efectivo' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.monto_aplicado).toBeCloseTo(10.33, 2);
    expect(body.saldo_pendiente_restante).toBeCloseTo(0, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// USD exacto → 201, nota saldada
// ═══════════════════════════════════════════════════════════════════
describe('POST /api/notas-venta/[id]/pagar — USD exacto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'vendedor', nombre: 'Vendedor' } });
  });

  it('201 y saldo_pendiente_restante=0 para pago exacto en USD', async () => {
    const POST = await getPOST();
    sql.mockResolvedValueOnce([{ id: 1, estado: 'activa', cliente_id: 5, nombre_cliente: 'Juan' }]);
    sql.mockResolvedValueOnce([{ total: 85.20 }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([{
      id: 1, fecha: '2026-07-06', tipo: 'cobro', cliente_id: 5,
      nombre_cliente: 'Juan', cuenta_id: 1, moneda: 'USD', monto: 85.20,
      monto_usd: 85.20, tipo_cambio: null, forma_pago: 'transferencia',
      observaciones: null, empresa: 'bazar-naty', es_credito: false,
      usuario_id: 7, usuario_nombre: 'Vendedor', monto_aplicado: 85.20,
    }]);

    const req = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
      method: 'POST',
      body: JSON.stringify({ cuenta_id: 1, monto: 85.20, moneda: 'USD', forma_pago: 'transferencia' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.monto_aplicado).toBeCloseTo(85.20, 2);
    expect(body.saldo_pendiente_restante).toBeCloseTo(0, 2);
    expect(body.cobro).toBeDefined();
    expect(body.cobro.id).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// ARS con default floor nunca excede (3 casos numéricos)
// ═══════════════════════════════════════════════════════════════════
describe('POST /api/notas-venta/[id]/pagar — ARS floor roundtrip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
  });

  const roundUpToHalf = (v: number) => Math.ceil(v * 2) / 2;
  const ROUND_TRIP = (ars: number, dolar: number) => roundUpToHalf(ars / dolar);

  const casos = [
    { label: '10.33 USD × 980.5', saldo: 10.33, dolar: 980.5 },
    { label: '85.20 USD × 1210', saldo: 85.20, dolar: 1210 },
    { label: '124.70 USD × 960.75', saldo: 124.70, dolar: 960.75 },
  ];

  casos.forEach(({ label, saldo, dolar }) => {
    it(`floor para ${label}: roundUpToHalf puede exceder saldo, backend capa a ${saldo}`, async () => {
      const POST = await getPOST();
      const defaultArs = Math.floor(saldo * dolar);
      const montoUsd = ROUND_TRIP(defaultArs, dolar);

      // NOTA: floor NO garantiza que roundUpToHalf no exceda.
      // El backend maneja esto con Math.min (cap).
      // Este test verifica que el cap funciona, no que floor previene.
      const montoEsperado = Math.min(montoUsd, saldo);

      sql.mockResolvedValueOnce([{ id: 1, estado: 'activa', cliente_id: 5, nombre_cliente: 'Juan' }]);
      sql.mockResolvedValueOnce([{ total: saldo }]);
      sql.mockResolvedValueOnce([{ total: 0 }]);
      sql.mockResolvedValueOnce([{ valor: String(dolar) }]);
      // Backend pasa montoAplicado = Math.min(monto_usd, saldoPendiente)
      // CTE: una sola sentencia devuelve el cobro completo + monto_aplicado
      sql.mockResolvedValueOnce([{
        id: 1, fecha: '2026-07-06', tipo: 'cobro', cliente_id: 5,
        nombre_cliente: 'Juan', cuenta_id: 1, moneda: 'ARS', monto: defaultArs,
        monto_usd: montoUsd, tipo_cambio: dolar, forma_pago: 'efectivo',
        observaciones: null, empresa: 'bazar-naty', es_credito: false,
        usuario_id: 7, usuario_nombre: 'Admin', monto_aplicado: montoEsperado,
      }]);

      const req = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
        method: 'POST',
        body: JSON.stringify({ cuenta_id: 1, monto: defaultArs, moneda: 'ARS', forma_pago: 'efectivo' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.monto_aplicado).toBeCloseTo(montoEsperado, 2);
      expect(body.monto_aplicado).toBeLessThanOrEqual(saldo + 1e-10);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// ARS contra nota ya pagada → 422 (BUG PREVENT: no monto_aplicado=0 silencioso)
// ═══════════════════════════════════════════════════════════════════
describe('POST /api/notas-venta/[id]/pagar — ARS vs nota saldada', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
  });

  it('rechaza con 422 si nota ya esta pagada (saldo_pendiente=0) aunque sea ARS', async () => {
    const POST = await getPOST();
    // Nota ya saldada: total=100, total_pagado=100
    sql.mockResolvedValueOnce([{ id: 1, estado: 'activa', cliente_id: 5, nombre_cliente: 'Juan' }]);
    sql.mockResolvedValueOnce([{ total: 100 }]);
    sql.mockResolvedValueOnce([{ total: 100 }]); // saldo_pendiente = 0

    const req = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
      method: 'POST',
      body: JSON.stringify({ cuenta_id: 1, monto: 100000, moneda: 'ARS', forma_pago: 'efectivo' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/ya.*pagada|saldada/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Doble POST → segundo falla
// ═══════════════════════════════════════════════════════════════════
describe('POST /api/notas-venta/[id]/pagar — doble clic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
  });

  it('segundo POST a misma nota falla (saldo ya 0)', async () => {
    const POST = await getPOST();

    // Primer pago
    sql.mockResolvedValueOnce([{ id: 1, estado: 'activa', cliente_id: 5, nombre_cliente: 'Juan' }]);
    sql.mockResolvedValueOnce([{ total: 100 }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([{
      id: 1, fecha: '2026-07-06', tipo: 'cobro', cliente_id: 5,
      nombre_cliente: 'Juan', cuenta_id: 1, moneda: 'USD', monto: 100,
      monto_usd: 100, tipo_cambio: null, forma_pago: 'efectivo',
      observaciones: null, empresa: 'bazar-naty', es_credito: false,
      usuario_id: 7, usuario_nombre: 'Admin', monto_aplicado: 100,
    }]);

    const req1 = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
      method: 'POST',
      body: JSON.stringify({ cuenta_id: 1, monto: 100, moneda: 'USD', forma_pago: 'efectivo' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res1 = await POST(req1, { params: Promise.resolve({ id: '1' }) });
    expect(res1.status).toBe(201);

    // Segundo pago (nota ya saldada)
    sql.mockResolvedValueOnce([{ id: 1, estado: 'activa', cliente_id: 5, nombre_cliente: 'Juan' }]);
    sql.mockResolvedValueOnce([{ total: 100 }]);
    sql.mockResolvedValueOnce([{ total: 100 }]);

    const req2 = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
      method: 'POST',
      body: JSON.stringify({ cuenta_id: 1, monto: 100, moneda: 'USD', forma_pago: 'efectivo' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res2 = await POST(req2, { params: Promise.resolve({ id: '1' }) });
    expect(res2.status).toBe(422);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Nota sin items → 422
// ═══════════════════════════════════════════════════════════════════
describe('POST /api/notas-venta/[id]/pagar — nota sin items', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });
  });

  it('422 si total de nota es 0', async () => {
    const POST = await getPOST();
    sql.mockResolvedValueOnce([{ id: 1, estado: 'activa', cliente_id: 5, nombre_cliente: 'Juan' }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);

    const req = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
      method: 'POST',
      body: JSON.stringify({ cuenta_id: 1, monto: 0.01, moneda: 'USD', forma_pago: 'efectivo' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(422);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Body inválido → 400
// ═══════════════════════════════════════════════════════════════════
describe('POST /api/notas-venta/[id]/pagar — body invalido', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });
  });

  it('400 si falta monto', async () => {
    const POST = await getPOST();
    const req = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
      method: 'POST',
      body: JSON.stringify({ cuenta_id: 1, moneda: 'USD', forma_pago: 'efectivo' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
  });

  it('400 si moneda invalida', async () => {
    const POST = await getPOST();
    const req = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
      method: 'POST',
      body: JSON.stringify({ cuenta_id: 1, monto: 100, moneda: 'EUR', forma_pago: 'efectivo' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
  });

  it('400 si monto <= 0', async () => {
    const POST = await getPOST();
    const req = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
      method: 'POST',
      body: JSON.stringify({ cuenta_id: 1, monto: 0, moneda: 'USD', forma_pago: 'efectivo' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Atomicidad — cobro y vínculo en UNA sola sentencia (BUG-031)
// ═══════════════════════════════════════════════════════════════════
// El bug: pagar/route.ts hacía 2 INSERTs secuenciales (cobro, luego vínculo).
// Si el segundo fallaba, el primero ya quedaba grabado = cobro huérfano.
// El fix: una sola sentencia CTE (WITH mov AS ...) → atómica en Postgres.
// Un mock de sql no puede probar el rollback real de Postgres; el proxy
// testable es que la estructura emita UNA sentencia con ambos INSERTs.
describe('POST /api/notas-venta/[id]/pagar — atomicidad (BUG-031)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
  });

  it('emite UNA sola sentencia CTE que inserta cobro Y vínculo (regresión: si vuelve a 2 INSERTs, falla)', async () => {
    const POST = await getPOST();
    sql.mockResolvedValueOnce([{ id: 1, estado: 'activa', cliente_id: 5, nombre_cliente: 'Juan' }]);
    sql.mockResolvedValueOnce([{ total: 85.20 }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([{
      id: 1, fecha: '2026-07-06', tipo: 'cobro', cliente_id: 5,
      nombre_cliente: 'Juan', cuenta_id: 1, moneda: 'USD', monto: 85.20,
      monto_usd: 85.20, tipo_cambio: null, forma_pago: 'transferencia',
      observaciones: null, empresa: 'bazar-naty', es_credito: false,
      usuario_id: 7, usuario_nombre: 'Admin', monto_aplicado: 85.20,
    }]);

    const req = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
      method: 'POST',
      body: JSON.stringify({ cuenta_id: 1, monto: 85.20, moneda: 'USD', forma_pago: 'transferencia' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(201);

    // 4 llamadas: nota, total, pagado, y UNA sola escritura atómica.
    expect(sql).toHaveBeenCalledTimes(4);

    // Reconstruir la sentencia SQL del último call y verificar que contiene
    // ambos INSERTs dentro de un mismo CTE (no dos sentencias separadas).
    const statement = sql.mock.calls[3][0].join('');
    expect(statement).toMatch(/WITH mov AS/);
    expect(statement).toMatch(/INSERT INTO caja_movimientos/);
    expect(statement).toMatch(/INSERT INTO caja_movimiento_notas/);
    // El vínculo se inserta SELECT mov.id DESDE la misma sentencia.
    expect(statement).toMatch(/SELECT mov\.id/);
  });
});

describe('POST /api/notas-venta/[id]/pagar — fallo de escritura atómica', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
  });

  it('500 si la sentencia CTE falla — no reintenta como INSERT separado, no deja cobro huérfano', async () => {
    const POST = await getPOST();
    sql.mockResolvedValueOnce([{ id: 1, estado: 'activa', cliente_id: 5, nombre_cliente: 'Juan' }]);
    sql.mockResolvedValueOnce([{ total: 85.20 }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    // La escritura atómica (4to call) falla por cualquier causa.
    sql.mockRejectedValueOnce(new Error('constraint violation'));

    const req = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
      method: 'POST',
      body: JSON.stringify({ cuenta_id: 1, monto: 85.20, moneda: 'USD', forma_pago: 'transferencia' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(500);

    // Solo se intentó UNA escritura (el 4to call); no hubo un INSERT de
    // cobro grabado y reintentado por separado sin su vínculo.
    expect(sql).toHaveBeenCalledTimes(4);
  });
});
