/**
 * @jest-environment node
 *
 * Fase B — Slice 3a: modalidad detalle/mayor elegida por el vendedor.
 * Intenta romper: migración 046, POST/PATCH de items, tipo de nota, etiqueta,
 * propagación de precios, conversión de pedidos y tienda online.
 */
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('migración 046', () => {
  const sql = read('migrations/046_modalidad_detalle_mayor.sql');
  it('idempotente, migra valores y agrega CHECK nuevo', () => {
    expect(sql).toMatch(/DO \$\$/);
    expect(sql).toContain("'detalle'");
    expect(sql).toContain("'mayor'");
    expect(sql).toContain("WHERE modalidad = 'unidad'");
    expect(sql).toContain("WHERE modalidad = 'caja'");
    expect(sql).toMatch(/CHECK \(modalidad IN \('detalle','mayor'\)\)/);
    expect(sql).toMatch(/GENERATED ALWAYS AS \(unidades \* precio\) STORED/);
    expect(sql).toContain('information_schema');
  });
  it('está en MIGRATION_ORDER como última', () => {
    const { MIGRATION_ORDER } = require('../scripts/migrations-order');
    expect(MIGRATION_ORDER[MIGRATION_ORDER.length - 1]).toBe('047_pedido_items_precio_lista.sql');
  });
});

// ───────────────────────── POST items ─────────────────────────
const getServerSession = jest.fn();
const sql = jest.fn();
jest.mock('next-auth', () => ({ getServerSession: (...a: any[]) => getServerSession(...a) }));
jest.mock('@/lib/db', () => ({ sql: (...a: any[]) => sql(...a) }));
import { POST } from '@/app/api/notas-venta/[id]/items/route';
import { PATCH } from '@/app/api/notas-venta/[id]/items/[itemId]/route';

const POST_CTX = { params: Promise.resolve({ id: '1' }) };
const mkPost = (body: unknown) => new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify(body) });

const producto = (over: Record<string, unknown> = {}) => ({ prcventa: 1500, precio_mayor: 900, ...over });

function mockPostDb(prod: unknown = producto()) {
  sql.mockImplementation((strings: any, ...values: any[]) => {
    const q = strings.join('');
    if (q.includes('FROM public.prenotas')) return [{ estado: 'activa' }];
    if (q.includes('FROM public.productos')) return prod === null ? [] : [prod];
    if (q.includes('WITH vencidos')) return [{ liberados: 0, unidades: 0 }];
    if (q.includes('UPDATE public.productos')) return [{ saldo: 100 }];
    if (q.includes('UPDATE public.ubicaciones_bodega')) return [];
    if (q.includes('INSERT INTO public.prenota_items')) {
      return [{ id: 'it', ...Object.fromEntries(['prenota_id', 'codigo', 'empresa_id', 'cajas', 'unidades', 'precio', 'modalidad'].map((c, i) => [c, values[i]])) }];
    }
    return [];
  });
}

const insCall = () => sql.mock.calls.find((c: any[]) => c[0].join('').includes('INSERT INTO public.prenota_items'));

describe('POST items — modalidad detalle/mayor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'vendedor', empresas: [1] } });
  });

  it('default detalle: precio = prcventa, cajas 0, descuenta unidades', async () => {
    mockPostDb();
    const res = await POST(mkPost({ codigo: 'P1', empresa_id: 1, unidades: 4 }), POST_CTX);
    expect(res.status).toBe(200);
    const vals = insCall()!.slice(1);
    expect(vals).toContain('detalle');
    // cajas va como literal 0 en el SQL (no se lee del body)
    expect(insCall()![0].join(' ')).toContain(', 0,');
    expect(vals).toContain(4);
    expect(vals).toContain(1500);
  });

  it('mayor usa precio_mayor por unidad (no multiplica)', async () => {
    mockPostDb();
    await POST(mkPost({ codigo: 'P1', empresa_id: 1, unidades: 7, modalidad: 'mayor' }), POST_CTX);
    const vals = insCall()!.slice(1);
    expect(vals).toContain('mayor');
    expect(vals).toContain(900);
    expect(vals).toContain(7);
  });

  it('mayor sin precio_mayor → 400 y no toca stock', async () => {
    mockPostDb(producto({ precio_mayor: null }));
    const res = await POST(mkPost({ codigo: 'P1', empresa_id: 1, unidades: 1, modalidad: 'mayor' }), POST_CTX);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'Producto sin precio mayor' });
    expect(sql.mock.calls.some((c: any[]) => c[0].join('').includes('UPDATE public.productos'))).toBe(false);
  });

  it('precio explícito se respeta en ambas modalidades', async () => {
    mockPostDb();
    await POST(mkPost({ codigo: 'P1', empresa_id: 1, unidades: 2, modalidad: 'mayor', precio: 777 }), POST_CTX);
    expect(insCall()!.slice(1)).toContain(777);
  });

  it.each([-1, 'abc'])('precio inválido %p → 400 sin DB', async (precio) => {
    const res = await POST(mkPost({ codigo: 'P1', empresa_id: 1, unidades: 1, precio }), POST_CTX);
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it.each(['caja', 'unidad', 'otra'])('modalidad vieja/inválida %p → 400 sin DB', async (modalidad) => {
    const res = await POST(mkPost({ codigo: 'P1', empresa_id: 1, unidades: 1, modalidad }), POST_CTX);
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, '3', undefined])('unidades inválidas %p → 400 sin DB', async (unidades) => {
    const res = await POST(mkPost({ codigo: 'P1', empresa_id: 1, unidades }), POST_CTX);
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it('body.cajas no influye en el stock ni en lo guardado', async () => {
    mockPostDb();
    await POST(mkPost({ codigo: 'P1', empresa_id: 1, unidades: 2, cajas: 99 }), POST_CTX);
    const stock = sql.mock.calls.find((c: any[]) => c[0].join('').includes('UPDATE public.productos'));
    expect(stock![1]).toBe(2);
    expect(insCall()![0].join(' ')).toContain(', 0,');
    expect(insCall()!.slice(1)).not.toContain(99);
  });
});

// ───────────────────────── PATCH items ─────────────────────────
const P_CTX = { params: Promise.resolve({ id: '1', itemId: 'i1' }) };
const mkPatch = (body: unknown) => new NextRequest('http://localhost', { method: 'PATCH', body: JSON.stringify(body) });
const ITEM = { unidades: 5, precio: 1500, codigo: 'P1', empresa_id: 1, modalidad: 'detalle' };

function mockPatchDb(item: unknown, prod: unknown = producto()) {
  sql.mockImplementation((strings: any, ...values: any[]) => {
    const q = strings.join('');
    if (q.includes('FROM public.prenotas')) return [{ estado: 'activa' }];
    if (q.includes('FROM public.prenota_items')) return [item];
    if (q.includes('FROM public.productos')) return prod === null ? [] : [prod];
    if (q.includes('UPDATE public.productos')) return [{ saldo: 100 }];
    if (q.includes('UPDATE public.ubicaciones_bodega')) return [];
    if (q.includes('UPDATE public.prenota_items')) return [{ id: 'i1', ...values }];
    return [];
  });
}
const updItem = () => sql.mock.calls.find((c: any[]) => c[0].join('').includes('UPDATE public.prenota_items'));

describe('PATCH items — modalidad mutable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'vendedor', empresas: [1] } });
  });

  it('detalle → mayor sin precio: toma precio_mayor y conserva unidades', async () => {
    mockPatchDb(ITEM);
    const res = await PATCH(mkPatch({ modalidad: 'mayor' }), P_CTX);
    expect(res.status).toBe(200);
    const vals = updItem()!.slice(1);
    expect(vals).toEqual(expect.arrayContaining(['mayor', 5, 900]));
  });

  it('cambiar a mayor sin precio_mayor → 400 sin actualizar', async () => {
    mockPatchDb(ITEM, producto({ precio_mayor: null }));
    const res = await PATCH(mkPatch({ modalidad: 'mayor' }), P_CTX);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'Producto sin precio mayor' });
    expect(updItem()).toBeUndefined();
  });

  it('modalidad mayor + precio explícito: respeta el precio del vendedor', async () => {
    mockPatchDb(ITEM);
    await PATCH(mkPatch({ modalidad: 'mayor', precio: 850 }), P_CTX);
    expect(updItem()!.slice(1)).toEqual(expect.arrayContaining(['mayor', 850]));
  });

  it('mayor → detalle sin precio: toma prcventa', async () => {
    mockPatchDb({ ...ITEM, modalidad: 'mayor', precio: 900 });
    await PATCH(mkPatch({ modalidad: 'detalle' }), P_CTX);
    expect(updItem()!.slice(1)).toEqual(expect.arrayContaining(['detalle', 1500]));
  });

  it('unidades editables en mayor con delta de stock', async () => {
    mockPatchDb({ ...ITEM, modalidad: 'mayor' });
    const res = await PATCH(mkPatch({ unidades: 9 }), P_CTX);
    expect(res.status).toBe(200);
    const stock = sql.mock.calls.find((c: any[]) => c[0].join('').includes('UPDATE public.productos'));
    expect(stock![1]).toBe(4); // 9 - 5
    expect(updItem()!.slice(1)).toContain(9);
  });

  it('patrón parcial sin modalidad conserva precio y no lee productos', async () => {
    mockPatchDb(ITEM);
    await PATCH(mkPatch({ precio: 1900 }), P_CTX);
    expect(sql.mock.calls.some((c: any[]) => c[0].join('').includes('FROM public.productos'))).toBe(false);
    expect(updItem()!.slice(1)).toEqual(expect.arrayContaining([1900, 5]));
  });

  it('modalidad inválida → 400 sin DB', async () => {
    const res = await PATCH(mkPatch({ modalidad: 'caja' }), P_CTX);
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it('precio negativo → 400 sin DB', async () => {
    const res = await PATCH(mkPatch({ precio: -1 }), P_CTX);
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });
});

// ───────────────────────── tipos / etiquetas ─────────────────────────
describe('tipo de nota y etiqueta de cliente', () => {
  it('lista de notas usa mayor/detalle', () => {
    const s = read('app/api/notas-venta/route.ts');
    expect(s).toMatch(/BOOL_AND\(pi\.modalidad = 'mayor'\)/);
    expect(s).toMatch(/BOOL_AND\(pi\.modalidad = 'detalle'\)/);
    expect(s).not.toMatch(/modalidad = 'caja'|modalidad = 'unidad'/);
  });
  it('detalle de nota usa mayor/detalle', () => {
    const s = read('app/api/notas-venta/[id]/route.ts');
    expect(s).toMatch(/modalidad === 'mayor'/);
    expect(s).toMatch(/modalidad === 'detalle'/);
    expect(s).not.toMatch(/modalidad === 'caja'|modalidad !== 'caja'/);
  });
  it('etiqueta cliente usa mayorista/minorista con los valores nuevos', () => {
    const s = read('app/api/clientes/route.ts');
    expect(s).toMatch(/BOOL_AND\(pi\.modalidad='mayor'\) THEN 'mayorista'/);
    expect(s).toMatch(/BOOL_AND\(pi\.modalidad='detalle'\) THEN 'minorista'/);
  });
});

describe('propagación de precios', () => {
  it("prcventa → 'detalle' y precio_mayor → 'mayor'", () => {
    const s = read('app/api/productos/[id]/route.ts');
    expect(s).toMatch(/modalidad = 'detalle'/);
    expect(s).toMatch(/modalidad = 'mayor'/);
    expect(s).not.toMatch(/modalidad = 'unidad'|modalidad = 'caja'/);
  });
});

// ───────────────────────── convertir pedidos ─────────────────────────
describe('convertir pedidos', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  function mockConvertir(estado: string, reservado: boolean, items: any[], entrega = 0) {
    sql.mockImplementation((strings: any, ...values: any[]) => {
      const q = strings.join('');
      if (q.includes('INSERT INTO public.prenotas') && q.includes('public.pedido_items')) return [{ prenota_id: 42 }];
      if (q.includes('FROM public.pedidos WHERE id')) return [{ id: 'x', estado, cliente_id: null, stock_reservado: reservado, entrega_costo: entrega }];
      if (q.includes('COUNT(*) FROM public.prenotas')) return [{ count: '0' }];
      if (q.includes('INSERT INTO public.prenotas')) return [{ id: 42 }];
      if (q.includes('FROM public.pedido_items')) return items;
      if (q.includes('SELECT imagen_url FROM public.productos')) return [{ imagen_url: 'img' }];
      if (q.includes('UPDATE public.productos')) return [{ saldo: 10 }];
      return [];
    });
  }
  const llamadas = () => sql.mock.calls.map((c: any[]) => ({ texto: c[0].join(''), valores: [...c.slice(1)] }));

  it('ruta reservada: copia modalidad mapeada, cajas 0 y unidades', async () => {
    mockConvertir('pagado', true, [{ codigo: 'A', cantidad: 2, modalidad: 'unidad' }]);
    const { convertirPedido } = await import('@/lib/pedidos/convertir');
    const r = await convertirPedido('x', 9, 'MP');
    expect(r.status).toBe(201);
    const cte = llamadas().find((c) => c.texto.includes('INSERT INTO public.prenotas') && c.texto.includes('public.pedido_items'))!;
    expect(cte.texto).toMatch(/modalidad IN \('mayor','caja'\)|IN \('mayor', 'caja'\)/);
    expect(cte.texto).toMatch(/COALESCE\(pi\.unidades, pi\.cantidad\)/);
    expect(cte.texto).toMatch(/\b0\b/);
    expect(r.body.data!.convertidos).toEqual([{ codigo: 'A', cajas: 0 }]);
  });

  it('ruta legacy: unidades = cantidad y precio del item (no cantidad*cantcaja)', async () => {
    mockConvertir('pendiente', false, [
      { codigo: 'A', detalle: 'A', cantidad: 3, precio: 500, unidades: null, modalidad: 'unidad' },
      { codigo: 'B', detalle: 'B', cantidad: 1, precio: 120, unidades: null, modalidad: 'caja' },
    ]);
    const { convertirPedido } = await import('@/lib/pedidos/convertir');
    const r = await convertirPedido('x', 9, 'MP');
    expect(r.status).toBe(201);
    const ins = llamadas().filter((c) => c.texto.includes('INSERT INTO public.prenota_items') && c.texto.includes('VALUES'));
    expect(ins).toHaveLength(2);
    // [prenotaId, codigo, detalle, imagen, empresa, unidades, precio, modalidad]; cajas = literal 0
    expect(ins[0].texto).toContain(', 0,');
    expect(ins[0].valores[5]).toBe(3);
    expect(ins[0].valores[6]).toBe(500);
    expect(ins[0].valores).toContain('detalle');
    expect(ins[1].valores[2]).toBe('B');
    expect(ins[1].valores[5]).toBe(1);
    expect(ins[1].valores[6]).toBe(120);
    expect(ins[1].valores).toContain('mayor');
    const stock = llamadas().find((c) => c.texto.includes('UPDATE public.productos'));
    expect(stock!.valores[0] ?? stock!.valores[1]).toBe(3);
  });
});

// ───────────────────────── tienda online ─────────────────────────
describe('tienda: precios y pedidos', () => {
  it('precios deriva la modalidad del servidor (Slice 4b)', () => {
    const s = read('lib/pedidos/precios.ts');
    expect(s).toContain('export type Modalidad = ModalidadTienda');
    expect(s).toContain('precioLineaTienda');
  });
  it('POST pedidos calcula la modalidad y guarda precio_lista; GET sin cantcaja', () => {
    const s = read('app/api/pedidos/route.ts');
    expect(s).not.toMatch(/cantcaja/);
    expect(s).toContain('precio_lista');
    expect(s).not.toContain('El precio por mayor no está disponible en la tienda online');
  });
});

describe('conserva lo intacto', () => {
  it('POST items mantiene idempotencia, guard de nota, liberación y ubicaciones', () => {
    const s = read('app/api/notas-venta/[id]/items/route.ts');
    expect(s).toContain('liberarReservasVencidas');
    expect(s).toContain('ubicaciones_bodega');
    expect(s).toContain('saldo >= ${cantidadTotal}');
    expect(s).toContain('WHERE id = ${itemId}');
    expect(s).not.toMatch(/cantcaja/);
  });
  it('PATCH sin lógica de cajas/razón', () => {
    const s = read('app/api/notas-venta/[id]/items/[itemId]/route.ts');
    expect(s).not.toMatch(/cantidadAnterior \/ Number\(item\.cajas\)/);
  });
});
