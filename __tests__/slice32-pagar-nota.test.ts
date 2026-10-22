/**
 * @jest-environment node
 *
 * Slice "Marcar como pagada" — tests que intentan romper.
 * Slice 2c: CLP única (sin moneda/ARS/monto_usd), montos enteros.
 */

import fs from 'fs';
import path from 'path';
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

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ROUTE_PATH = 'app/api/notas-venta/[id]/pagar/route.ts';
const UI_PATH = 'app/(app)/notas-venta/[id]/client_page.tsx';

async function getPOST() {
  const mod = await import('@/app/api/notas-venta/[id]/pagar/route');
  return mod.POST;
}

async function post(body: any) {
  const POST = await getPOST();
  const req = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  });
  return POST(req, { params: Promise.resolve({ id: '1' }) });
}

const nota = { id: 1, estado: 'activa', cliente_id: 5, nombre_cliente: 'Juan' };
const cobro = {
  id: 1, fecha: '2026-07-06', tipo: 'cobro', cliente_id: 5, nombre_cliente: 'Juan',
  cuenta_id: 1, monto: 8520, forma_pago: 'transferencia', observaciones: null,
  empresa: 'bazar-naty', es_credito: false, usuario_id: 7, usuario_nombre: 'Admin',
};
const body = { cuenta_id: 1, monto: 8520, forma_pago: 'transferencia' };

describe('Smoke — archivos del slice existen', () => {
  test('nueva ruta /pagar existe', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, ROUTE_PATH))).toBe(true);
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

describe('POST /api/notas-venta/[id]/pagar — auth', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('401 si no hay sesion', async () => {
    getServerSession.mockResolvedValue(null);
    expect((await post(body)).status).toBe(401);
  });

  it('403 si rol bodeguero', async () => {
    getServerSession.mockResolvedValue({ user: { id: '5', rol: 'bodeguero' } });
    expect((await post(body)).status).toBe(403);
  });
});

describe('POST /api/notas-venta/[id]/pagar — flujo CLP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
  });

  it('404 si nota no encontrada', async () => {
    sql.mockResolvedValueOnce([]);
    expect((await post(body)).status).toBe(404);
  });

  it('15000 vs saldo 10000 -> aplicado 10000, credito 5000 enteros; moneda ARS ignorada, INSERT CLP sin caja_config', async () => {
    sql.mockResolvedValueOnce([nota]);
    sql.mockResolvedValueOnce([{ total: 10000 }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([{ ...cobro, monto: 15000 }]);
    const res = await post({ cuenta_id: 1, monto: 15000, moneda: 'ARS', forma_pago: 'efectivo' });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.monto_aplicado).toBe(10000);
    expect(json.credito_generado).toBe(5000);
    expect(sql).toHaveBeenCalledTimes(4);
    const stmt = sql.mock.calls[3][0].join('');
    expect(stmt).toContain("'CLP'");
    expect(stmt).not.toMatch(/monto_usd|tipo_cambio|caja_config/);
    expect(sql.mock.calls[3]).not.toContain('ARS');
  });

  it('sobrepago sin cliente_id: se capa en silencio, credito 0', async () => {
    sql.mockResolvedValueOnce([{ ...nota, cliente_id: null }]);
    sql.mockResolvedValueOnce([{ total: 10000 }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([cobro]);
    const json = await (await post({ cuenta_id: 1, monto: 15000, forma_pago: 'efectivo' })).json();
    expect(json.monto_aplicado).toBe(10000);
    expect(json.credito_generado).toBe(0);
  });

  it('pago exacto: 201 y saldo_pendiente_restante=0', async () => {
    sql.mockResolvedValueOnce([nota]);
    sql.mockResolvedValueOnce([{ total: 8520 }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([cobro]);
    const res = await post(body);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.monto_aplicado).toBe(8520);
    expect(json.saldo_pendiente_restante).toBe(0);
    expect(json.cobro.id).toBe(1);
  });

  it('422 si nota ya pagada (segundo POST / doble clic)', async () => {
    sql.mockResolvedValueOnce([nota]);
    sql.mockResolvedValueOnce([{ total: 100 }]);
    sql.mockResolvedValueOnce([{ total: 100 }]);
    const res = await post({ cuenta_id: 1, monto: 100000, forma_pago: 'efectivo' });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/ya.*pagada|saldada/i);
  });

  it('422 si total de nota es 0', async () => {
    sql.mockResolvedValueOnce([nota]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    expect((await post({ cuenta_id: 1, monto: 1, forma_pago: 'efectivo' })).status).toBe(422);
  });
});

describe('POST /api/notas-venta/[id]/pagar — body invalido', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });
  });

  it('400 si falta monto', async () => {
    expect((await post({ cuenta_id: 1, forma_pago: 'efectivo' })).status).toBe(400);
  });

  it('400 si monto <= 0', async () => {
    expect((await post({ ...body, monto: 0 })).status).toBe(400);
  });

  it('400 si monto decimal (100.5)', async () => {
    expect((await post({ ...body, monto: 100.5 })).status).toBe(400);
  });
});

// BUG-031: cobro y vínculo en UNA sola sentencia CTE (atómica en Postgres).
describe('POST /api/notas-venta/[id]/pagar — atomicidad (BUG-031)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
  });

  it('emite UNA sola sentencia CTE que inserta cobro Y vínculo', async () => {
    sql.mockResolvedValueOnce([nota]);
    sql.mockResolvedValueOnce([{ total: 8520 }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([cobro]);
    expect((await post(body)).status).toBe(201);
    expect(sql).toHaveBeenCalledTimes(4);
    const statement = sql.mock.calls[3][0].join('');
    expect(statement).toMatch(/WITH mov AS/);
    expect(statement).toMatch(/INSERT INTO caja_movimientos/);
    expect(statement).toMatch(/INSERT INTO caja_movimiento_notas/);
    expect(statement).toMatch(/SELECT mov\.id/);
  });

  it('500 si la sentencia CTE falla — sin reintento ni cobro huérfano', async () => {
    sql.mockResolvedValueOnce([nota]);
    sql.mockResolvedValueOnce([{ total: 8520 }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockRejectedValueOnce(new Error('constraint violation'));
    expect((await post(body)).status).toBe(500);
    expect(sql).toHaveBeenCalledTimes(4);
  });
});
