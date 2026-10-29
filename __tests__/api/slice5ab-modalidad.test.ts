/**
 * @jest-environment node
 *
 * Fase B — Slice 5a+5b (actualizado por Slice 3a): migracion 041/046, subtotal
 * en servidor, items por modalidad 'detalle'|'mayor', propagacion de precios.
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

  it('migraciones 041 y 046 idempotentes, en el orden', () => {
    const s41 = read('migrations/041_prenota_items_modalidad_subtotal.sql');
    expect(s41).toContain('IF NOT EXISTS');
    expect(s41).toMatch(/GENERATED ALWAYS AS[\s\S]*STORED/);
    const s46 = read('migrations/046_modalidad_detalle_mayor.sql');
    expect(s46).toContain('DO $$');
    expect(s46).toMatch(/CHECK \(modalidad IN \('detalle','mayor'\)\)/);
    expect(s46).toMatch(/GENERATED ALWAYS AS \(unidades \* precio\) STORED/);
    const { MIGRATION_ORDER } = require('../../scripts/migrations-order');
    expect(MIGRATION_ORDER).toContain('041_prenota_items_modalidad_subtotal.sql');
    expect(MIGRATION_ORDER).toContain('046_modalidad_detalle_mayor.sql');
  });
});

const ctx = { params: Promise.resolve({ id: '1' }) };
const mk = (body: any) => new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify(body) });
const PRODUCTO = { prcventa: 1500, precio_mayor: 10000 };
const MAYOR = { codigo: 'P1', descripcion: 'x', empresa_id: 1, modalidad: 'mayor', unidades: 3, precio: 10000 };

function mockPost(prod: any = PRODUCTO) {
  sql.mockImplementation((strings: any, ...values: any[]) => {
    const q = strings.join('');
    if (q.includes('FROM public.prenotas')) return [{ estado: 'activa' }];
    if (q.includes('FROM public.productos')) return prod === null ? [] : [prod];
    if (q.includes('WITH vencidos')) return [{ liberados: 0, unidades: 0 }];
    if (q.includes('UPDATE public.productos')) return [{ saldo: 100 }];
    if (q.includes('INSERT INTO public.prenota_items')) return [{ id: 'a', ...values }];
    return [];
  });
}
const insert = () => sql.mock.calls.find((c: any[]) => c[0].join('').includes('INSERT INTO public.prenota_items'));

describe('5b — POST items modalidad', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'vendedor' } });
  });

  it('modalidad invalida (caja) -> 400', async () => {
    const res = await POST(mk({ ...MAYOR, modalidad: 'caja' }), ctx);
    expect(res.status).toBe(400);
  });

  it.each([0, 1.5, -1, '3', true])('unidades=%p -> 400 sin tocar DB', async (unidades) => {
    const res = await POST(mk({ ...MAYOR, unidades }), ctx);
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it.each([null, 0])('mayor sin precio_mayor valido (%p) -> 400 sin tocar stock', async (precio_mayor) => {
    mockPost({ prcventa: 1500, precio_mayor });
    const res = await POST(mk(MAYOR), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'Producto sin precio mayor' });
    expect(sql.mock.calls.some((c: any[]) => c[0].join('').includes('UPDATE public.productos'))).toBe(false);
  });

  it('mayor descuenta unidades (no cajas) e inserta modalidad; cajas = 0', async () => {
    mockPost();
    expect((await POST(mk({ ...MAYOR, cajas: 9 }), ctx)).status).toBe(200);
    expect(sql.mock.calls.find((c: any[]) => c[0].join('').includes('UPDATE public.productos'))![1]).toBe(3);
    const ins = insert()!;
    expect(ins[0].join(' ')).toContain(', 0,');
    expect(ins.slice(1)).toContain('mayor');
    expect(ins.slice(1)).toContain(10000);
  });

  it('detalle por defecto usa prcventa', async () => {
    mockPost();
    expect((await POST(mk({ codigo: 'P1', empresa_id: 1, unidades: 2 }), ctx)).status).toBe(200);
    expect(insert()!.slice(1)).toContain(1500);
    expect(insert()!.slice(1)).toContain('detalle');
  });

  it('stock insuficiente -> 400 con disponible', async () => {
    sql.mockImplementation((strings: any) => {
      const q = strings.join('');
      if (q.includes('FROM public.prenotas')) return [{ estado: 'activa' }];
      if (q.includes('SELECT saldo FROM public.productos')) return [{ saldo: 5 }];
      if (q.includes('FROM public.productos')) return [PRODUCTO];
      if (q.includes('WITH vencidos')) return [{ liberados: 0, unidades: 0 }];
      if (q.includes('UPDATE public.productos')) return [];
      return [];
    });
    const res = await POST(mk(MAYOR), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ disponible: 5, solicitado: 3 });
  });

  it('reintento con mismo id devuelve la fila sin descontar', async () => {
    sql.mockResolvedValueOnce([{ id: 'u1' }]);
    const res = await POST(mk({ ...MAYOR, id: 'u1' }), ctx);
    expect(res.status).toBe(200);
    expect(sql).toHaveBeenCalledTimes(1);
  });
});

describe('5b — PATCH items modalidad mutable', () => {
  const pctx = { params: Promise.resolve({ id: '1', itemId: 'i1' }) };
  const patch = (body: any) => PATCH(new NextRequest('http://localhost', { method: 'PATCH', body: JSON.stringify(body) }), pctx);
  const ITEM = { unidades: 3, precio: 10000, codigo: 'P1', empresa_id: 1, modalidad: 'mayor' };
  const upd = () => sql.mock.calls.find((c: any[]) => c[0].join('').includes('UPDATE public.prenota_items'));

  function mockPatch(item: any = ITEM, prod: any = PRODUCTO) {
    sql.mockImplementation((strings: any, ...values: any[]) => {
      const q = strings.join('');
      if (q.includes('FROM public.prenotas')) return [{ estado: 'activa' }];
      if (q.includes('FROM public.prenota_items')) return [item];
      if (q.includes('FROM public.productos')) return [prod];
      if (q.includes('UPDATE public.productos')) return [{ saldo: 100 }];
      if (q.includes('UPDATE public.prenota_items')) return [{ id: 'i1', ...values }];
      return [];
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'vendedor' } });
  });

  it('mayor -> detalle sin precio toma prcventa', async () => {
    mockPatch();
    expect((await patch({ modalidad: 'detalle' })).status).toBe(200);
    expect(upd()!.slice(1)).toEqual(expect.arrayContaining(['detalle', 1500]));
  });

  it('detalle -> mayor sin precio toma precio_mayor', async () => {
    mockPatch({ ...ITEM, modalidad: 'detalle' });
    expect((await patch({ modalidad: 'mayor' })).status).toBe(200);
    expect(upd()!.slice(1)).toEqual(expect.arrayContaining(['mayor', 10000]));
  });

  it('detalle -> mayor sin precio_mayor -> 400', async () => {
    mockPatch({ ...ITEM, modalidad: 'detalle' }, { prcventa: 1500, precio_mayor: null });
    expect((await patch({ modalidad: 'mayor' })).status).toBe(400);
  });

  it('precio negativo -> 400', async () => {
    expect((await patch({ precio: -1 })).status).toBe(400);
  });

  it('PATCH parcial de solo precio conserva modalidad/unidades y no toca stock', async () => {
    mockPatch();
    expect((await patch({ precio: 9000 })).status).toBe(200);
    expect(upd()!.slice(1)).toEqual(['mayor', 3, 9000, 'i1']);
  });
});

describe('5b — PUT productos propaga por modalidad', () => {
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

  it('prcventa solo actualiza items detalle; precio_mayor solo items mayor', async () => {
    sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'P1', costo: null, prcventa: 50000, precio_mayor: null }]);
    sqlTransaction.mockResolvedValueOnce([[{ id: 1 }]]);
    expect((await put({ prcventa: 50000, precio_mayor: 30000 })).status).toBe(200);
    const qs = sqlQuery.mock.calls.map((c) => c[0] as string).slice(1);
    const det = qs.find((q) => q.includes("modalidad = 'detalle'"))!;
    const may = qs.find((q) => q.includes("modalidad = 'mayor'"))!;
    expect(sqlQuery.mock.calls.find((c) => c[0] === det)![1]).toEqual([50000, 'P1']);
    expect(sqlQuery.mock.calls.find((c) => c[0] === may)![1]).toEqual([30000, 'P1']);
    for (const q of [det, may]) {
      expect(q).toContain("estado = 'activa'");
      expect(q).toContain('caja_movimiento_notas');
    }
  });

  it('precio_mayor null no propaga a items mayor', async () => {
    sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'P1' }]);
    sqlTransaction.mockResolvedValueOnce([[{ id: 1 }]]);
    expect((await put({ precio_mayor: null })).status).toBe(200);
    expect(sqlQuery).toHaveBeenCalledTimes(1);
  });
});
