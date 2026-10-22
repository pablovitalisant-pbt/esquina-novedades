/**
 * @jest-environment node
 *
 * Fase B — Slice 4a+4b: precio_mayor (entero > 0 o null) en POST/PUT/GET /api/productos.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const getServerSession = jest.fn();
const sql = jest.fn();
const sqlQuery = jest.fn();
const sqlTransaction = jest.fn();

jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));
jest.mock('@/lib/db', () => {
  const fn = (...args: any[]) => sql(...args);
  fn.query = (...args: any[]) => sqlQuery(...args);
  fn.transaction = (...args: any[]) => sqlTransaction(...args);
  return { sql: fn };
});

import { POST, GET } from '../../app/api/productos/route';
import { PUT } from '../../app/api/productos/[id]/route';

const postReq = (body: any) => ({ json: () => Promise.resolve(body) }) as any;
const putReq = (body: any) => ({ json: () => Promise.resolve(body) }) as any;
const ctx = { params: Promise.resolve({ id: '1' }) };
const BASE = { codigo: 'PM-1', detalle: 'x', costo: 10, margen_pct: 30 };
const INVALIDOS: any[] = [0, -1, 1.5, 'abc', '1000', '', NaN, Infinity, true, false];

beforeEach(() => {
  jest.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { rol: 'admin', empresas: [1] } });
  sqlQuery.mockReturnValue({});
  sqlTransaction.mockResolvedValue([[{ id: 1, precio_mayor: 10000 }]]);
});

describe('PUT precio_mayor', () => {
  it.each(INVALIDOS)('%p → 400 sin tocar DB', async (v) => {
    const res = await PUT(putReq({ precio_mayor: v }), ctx);
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
    expect(sqlTransaction).not.toHaveBeenCalled();
  });

  it.each([null, 10000])('%p → 200 y entra al UPDATE', async (v) => {
    sql.mockResolvedValueOnce([{ empresa_id: 1, codigo: 'PM-1' }]);
    const res = await PUT(putReq({ precio_mayor: v }), ctx);
    expect(res.status).toBe(200);
    expect(sqlQuery.mock.calls[0][0]).toMatch(/precio_mayor = \$1/);
    expect(sqlQuery.mock.calls[0][1][0]).toBe(v);
  });

  it('ausente no toca precio_mayor', async () => {
    sql.mockResolvedValueOnce([{ empresa_id: 1, codigo: 'PM-1' }]);
    await PUT(putReq({ detalle: 'y' }), ctx);
    expect(sqlQuery.mock.calls[0][0]).not.toMatch(/precio_mayor/);
  });
});

describe('POST precio_mayor', () => {
  it.each(INVALIDOS)('%p → 400', async (v) => {
    const res = await POST(postReq({ ...BASE, precio_mayor: v }));
    expect(res.status).toBe(400);
  });

  it('valido → INSERT con precio_mayor', async () => {
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 1, precio_mayor: 10000 }]);
    const res = await POST(postReq({ ...BASE, precio_mayor: 10000 }));
    expect(res.status).toBe(201);
    expect(sql.mock.calls[1][0].join('')).toMatch(/precio_mayor/);
    expect(sql.mock.calls[1].slice(1)).toContain(10000);
  });

  it('omitido → INSERT con null', async () => {
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 1 }]);
    await POST(postReq(BASE));
    expect(sql.mock.calls[1].slice(1)).toContain(null);
  });
});

describe('GET agregado', () => {
  it('selecciona MAX(p.precio_mayor)', async () => {
    sql.mockResolvedValueOnce([]);
    await GET({ url: 'http://localhost/api/productos?search=a' } as any);
    expect(sql.mock.calls[0][0].join('')).toMatch(/MAX\(p\.precio_mayor\) as precio_mayor/i);
  });
});

describe('Migracion 040', () => {
  const sqlText = () => readFileSync(join(__dirname, '../../migrations/040_productos_precio_mayor.sql'), 'utf8');
  it('idempotente, nullable, CHECK > 0', () => {
    expect(sqlText()).toMatch(/ADD COLUMN IF NOT EXISTS precio_mayor INTEGER NULL/);
    expect(sqlText()).toMatch(/precio_mayor IS NULL OR precio_mayor > 0/);
  });
  it('queda al final de MIGRATION_ORDER', () => {
    const { MIGRATION_ORDER } = require('../../scripts/migrations-order');
    expect(MIGRATION_ORDER[MIGRATION_ORDER.length - 1]).toBe('041_prenota_items_modalidad_subtotal.sql');
  });
});
