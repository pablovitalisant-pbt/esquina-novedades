/**
 * @jest-environment node
 *
 * Fase B — Slice 5a+5b: migracion 041, subtotal en servidor, items por modalidad,
 * propagacion de precios por modalidad (H1).
 */
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/notas-venta/[id]/items/route';
import { PATCH } from '@/app/api/notas-venta/[id]/items/[itemId]/route';

const getServerSession = jest.fn();
const sql = jest.fn();
const sqlQuery = jest.fn();
const sqlTransaction = jest.fn();

jest.mock('next-auth', () => ({ getServerSession: (...a: any[]) => getServerSession(...a) }));
jest.mock('@/lib/db', () => {
  const fn = (...a: any[]) => sql(...a);
  fn.query = (...a: any[]) => sqlQuery(...a);
  fn.transaction = (...a: any[]) => sqlTransaction(...a);
  return { sql: fn };
});

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const SQL_FILES = [
  'app/api/notas-venta/route.ts',
  'app/api/deudores/route.ts',
  'app/api/notas-venta/[id]/pagar/route.ts',
  'app/api/notas-venta/[id]/aplicar-saldo-favor/route.ts',
  'app/api/caja/nota-busqueda/route.ts',
  'app/api/caja/notas/[kcodcli2]/route.ts',
  'app/api/caja/resumen/[kcodcli2]/route.ts',
  'app/api/caja/movimientos/[id]/notas/route.ts',
];

describe('5a — subtotal', () => {
  it.each(SQL_FILES)('%s suma pi.subtotal', (f) => {
    const s = read(f);
    expect(s).toContain('SUM(pi.subtotal)');
    expect(s).not.toMatch(/unidades\s*\*\s*pi\.precio|pi\.unidades\s*\*/);
  });

  it('detalle de nota usa subtotal (string numeric) y no unidades*precio', () => {
    const s = read('app/api/notas-venta/[id]/route.ts');
    expect(s).toContain('i.subtotal');
    expect(s).not.toMatch(/unidades\)?\s*\*\s*(Number\()?[\w.]*precio/);
  });

  it('migracion 041 idempotente con CHECK y GENERATED STORED, presente en el orden', () => {
    const s = read('migrations/041_prenota_items_modalidad_subtotal.sql');
    expect(s).toContain('IF NOT EXISTS');
    expect(s).toContain("CHECK (modalidad IN ('unidad','caja'))");
    expect(s).toMatch(/GENERATED ALWAYS AS[\s\S]*STORED/);
    const { MIGRATION_ORDER } = require('../../scripts/migrations-order');
    expect(MIGRATION_ORDER).toContain('041_prenota_items_modalidad_subtotal.sql');
  });
});

const ctx = { params: Promise.resolve({ id: '1' }) };
const mk = (body: any) => new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify(body) });
const CAJA = { codigo: 'P1', descripcion: 'x', empresa_id: 1, modalidad: 'caja', cajas: 3, unidades: 1, precio: 10000 };

describe('5b — POST items modalidad', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'vendedor' } });
  });
  const noStock = () => expect(sql.mock.calls.some((c) => c[0].join('').includes('UPDATE public.productos'))).toBe(false);

  it('modalidad invalida -> 400', async () => {
    const res = await POST(mk({ ...CAJA, modalidad: 'otra' }), ctx);
    expect(res.status).toBe(400);
  });

  it.each([0, 1.5, -1, '3', true])('caja con cajas=%p -> 400 sin tocar stock', async (cajas) => {
    sql.mockResolvedValueOnce([{ estado: 'activa' }]).mockResolvedValue([{ cantcaja: 12, precio_mayor: 10000 }]);
    const res = await POST(mk({ ...CAJA, cajas }), ctx);
    expect(res.status).toBe(400);
    noStock();
  });

  it.each([null, 0])('caja sin precio_mayor valido (%p) -> 400 sin tocar stock', async (precio_mayor) => {
    sql.mockResolvedValueOnce([{ estado: 'activa' }]).mockResolvedValueOnce([{ cantcaja: 12, precio_mayor }]);
    expect((await POST(mk(CAJA), ctx)).status).toBe(400);
    noStock();
  });

  it('caja con cantcaja=0 -> 400', async () => {
    sql.mockResolvedValueOnce([{ estado: 'activa' }]).mockResolvedValueOnce([{ cantcaja: 0, precio_mayor: 10000 }]);
    expect((await POST(mk(CAJA), ctx)).status).toBe(400);
    noStock();
  });

  it('caja ignora unidades del body: cajas=3, cantcaja=12 descuenta 36 e inserta modalidad', async () => {
    sql
      .mockResolvedValueOnce([{ estado: 'activa' }])
      .mockResolvedValueOnce([{ cantcaja: 12, precio_mayor: 10000 }])
      .mockResolvedValueOnce([{ saldo: 100 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'a' }])
      .mockResolvedValueOnce([]);
    expect((await POST(mk(CAJA), ctx)).status).toBe(200);
    expect(sql.mock.calls[2][1]).toBe(36);
    const insert = sql.mock.calls[4];
    expect(insert[0].join('')).toContain('modalidad');
    expect(insert.slice(1)).toContain(36);
    expect(insert.slice(1)).toContain('caja');
  });

  it('caja con stock insuficiente -> 400 con disponible/solicitado', async () => {
    sql
      .mockResolvedValueOnce([{ estado: 'activa' }])
      .mockResolvedValueOnce([{ cantcaja: 12, precio_mayor: 10000 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ saldo: 5 }]);
    const res = await POST(mk(CAJA), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ disponible: 5, solicitado: 36 });
  });

  it('reintento con mismo id devuelve la fila sin descontar', async () => {
    sql.mockResolvedValueOnce([{ id: 'u1' }]);
    const res = await POST(mk({ ...CAJA, id: 'u1' }), ctx);
    expect(res.status).toBe(200);
    expect(sql).toHaveBeenCalledTimes(1);
  });
});

describe('5b — PATCH items caja', () => {
  const pctx = { params: Promise.resolve({ id: '1', itemId: 'i1' }) };
  const patch = (body: any) => PATCH(new NextRequest('http://localhost', { method: 'PATCH', body: JSON.stringify(body) }), pctx);
  const ITEM = { unidades: 36, cajas: 3, precio: 10000, codigo: 'P1', empresa_id: 1, modalidad: 'caja' };
  beforeEach(() => {
    jest.resetAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'vendedor' } });
  });

  it('cajas 3->5 usa la razon congelada (12): delta 24, ignora unidades del body', async () => {
    sql
      .mockResolvedValueOnce([{ estado: 'activa' }])
      .mockResolvedValueOnce([ITEM])
      .mockResolvedValueOnce([{ saldo: 100 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'i1' }]);
    expect((await patch({ cajas: 5, unidades: 7 })).status).toBe(200);
    expect(sql.mock.calls[2][1]).toBe(24);
    expect(sql.mock.calls[4].slice(1)).toContain(60);
  });

  it('cajas=0 -> 400', async () => {
    sql.mockResolvedValueOnce([{ estado: 'activa' }]).mockResolvedValueOnce([ITEM]);
    expect((await patch({ cajas: 0 })).status).toBe(400);
  });

  it('cambiar modalidad -> 400', async () => {
    sql.mockResolvedValueOnce([{ estado: 'activa' }]).mockResolvedValueOnce([ITEM]);
    expect((await patch({ modalidad: 'unidad' })).status).toBe(400);
  });

  it('item caja con cajas=0 en DB -> 422', async () => {
    sql.mockResolvedValueOnce([{ estado: 'activa' }]).mockResolvedValueOnce([{ ...ITEM, cajas: 0 }]);
    expect((await patch({ cajas: 2 })).status).toBe(422);
  });

  it('PATCH parcial de solo precio conserva cajas/unidades y no toca stock', async () => {
    sql.mockResolvedValueOnce([{ estado: 'activa' }]).mockResolvedValueOnce([ITEM]).mockResolvedValueOnce([{ id: 'i1' }]);
    expect((await patch({ precio: 9000 })).status).toBe(200);
    expect(sql).toHaveBeenCalledTimes(3);
    expect(sql.mock.calls[2].slice(1)).toEqual([3, 36, 9000, 'i1']);
  });
});

describe('5b — PUT productos propaga por modalidad (H1)', () => {
  let PUT: any;
  beforeAll(async () => {
    PUT = (await import('@/app/api/productos/[id]/route')).PUT;
  });
  beforeEach(() => {
    jest.resetAllMocks();
    sqlQuery.mockReturnValue({});
    getServerSession.mockResolvedValue({ user: { rol: 'admin', empresas: [2] } });
  });
  const put = (body: any) =>
    PUT(new NextRequest('http://localhost/api/productos/1', { method: 'PUT', body: JSON.stringify(body) }), { params: { id: '1' } });

  it('prcventa solo actualiza items unidad; precio_mayor solo items caja', async () => {
    sql
      .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'P1' }])
      .mockResolvedValueOnce([{ costo: null, margen_pct: null }]);
    sqlTransaction.mockResolvedValueOnce([[{ id: 1 }]]);
    expect((await put({ prcventa: 2500, precio_mayor: 30000 })).status).toBe(200);
    const qs = sqlQuery.mock.calls.map((c) => c[0] as string).slice(1);
    const uni = qs.find((q) => q.includes("modalidad = 'unidad'"))!;
    const caja = qs.find((q) => q.includes("modalidad = 'caja'"))!;
    expect(sqlQuery.mock.calls.find((c) => c[0] === uni)![1]).toEqual([2500, 'P1']);
    expect(sqlQuery.mock.calls.find((c) => c[0] === caja)![1]).toEqual([30000, 'P1']);
    for (const q of [uni, caja]) {
      expect(q).toContain("estado = 'activa'");
      expect(q).toContain('caja_movimiento_notas');
    }
  });

  it('precio_mayor null no propaga a items caja', async () => {
    sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'P1' }]);
    sqlTransaction.mockResolvedValueOnce([[{ id: 1 }]]);
    expect((await put({ precio_mayor: null })).status).toBe(200);
    expect(sqlQuery).toHaveBeenCalledTimes(1);
  });
});
