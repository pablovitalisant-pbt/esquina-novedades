/**
 * @jest-environment node
 *
 * Slice 4b — Fase B: descuento por mayor automático en la tienda online.
 * La modalidad la decide el servidor a partir de la cantidad TOTAL por producto;
 * lo que mande el cliente ('unidad','detalle','caja','mayor' u omitida) se ignora.
 */
import { NextRequest } from 'next/server';

const sql = jest.fn();
const sqlTransaction = jest.fn();

jest.mock('@/config/feature-flags.json', () => ({
  'tienda-pago-online': false,
  'tienda-mayor-online': true,
}));
jest.mock('@/lib/db', () => {
  const mockSql = (...args: any[]) => sql(...args);
  mockSql.transaction = (...args: any[]) => sqlTransaction(...args);
  return { sql: mockSql };
});

import { POST } from '@/app/api/pedidos/route';
import { calcularPedido } from '@/lib/pedidos/precios';
import { precioLineaTienda } from '@/lib/precio-tienda';
import { construirItemsPreferencia } from '@/lib/pedidos/preferencia';

const RETIRO = { codigo: 'retiro', costo: 0, requiere_direccion: false, activa: true };
const producto = (over: Record<string, unknown> = {}) => ({
  id: 118,
  codigo: '1055',
  detalle: 'Gallinita',
  prcventa: 1500,
  precio_mayor: 1200,
  minimo_mayor: 6,
  cantcaja: 1,
  activo: true,
  costo: 100,
  saldo: 50,
  ...over,
});

describe('precioLineaTienda', () => {
  const base = { base: 1500, precio_mayor: 1200, minimo_mayor: 6, habilitado: true };

  test('cantidad = mínimo → mayor, precio_lista base y ahorro', () => {
    expect(precioLineaTienda({ ...base, cantidad: 6 })).toEqual({
      precio: 1200, precio_lista: 1500, modalidad: 'mayor', ahorro: 1800,
    });
  });

  test('mínimo - 1 → detalle sin ahorro', () => {
    expect(precioLineaTienda({ ...base, cantidad: 5 })).toEqual({
      precio: 1500, precio_lista: 1500, modalidad: 'detalle', ahorro: 0,
    });
  });

  test('mínimo o precio_mayor nulos → detalle', () => {
    expect(precioLineaTienda({ ...base, minimo_mayor: null, cantidad: 99 }).modalidad).toBe('detalle');
    expect(precioLineaTienda({ ...base, precio_mayor: null, cantidad: 99 }).modalidad).toBe('detalle');
    expect(precioLineaTienda({ ...base, minimo_mayor: undefined, cantidad: 99 }).modalidad).toBe('detalle');
  });

  test('precio_mayor >= base → detalle (nunca cobrar más por mayor)', () => {
    expect(precioLineaTienda({ ...base, precio_mayor: 1500, cantidad: 99 }).precio).toBe(1500);
    expect(precioLineaTienda({ ...base, precio_mayor: 2000, cantidad: 99 }).modalidad).toBe('detalle');
  });

  test('flag deshabilitado → detalle aunque cumpla', () => {
    expect(precioLineaTienda({ ...base, habilitado: false, cantidad: 99 }).modalidad).toBe('detalle');
  });
});

describe('calcularPedido — agrupación y descuento', () => {
  test('2 líneas del mismo producto que suman el mínimo → una línea mayor', () => {
    const r = calcularPedido(
      [
        { producto_id: 118, modalidad: 'unidad', cantidad: 3 },
        { producto_id: 118, modalidad: 'detalle', cantidad: 3 },
      ],
      [producto()],
      { origen: 'productos', entrega: RETIRO },
    );
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0]).toMatchObject({
      cantidad: 6, modalidad: 'mayor', precio: 1200, precio_lista: 1500,
      subtotal: 7200, ahorro: 1800, unidades: 6,
    });
    expect(r.descuento).toBe(1800);
    expect(r.total).toBe(7200);
  });

  test('precio_mayor >= base del catálogo (override menor) → detalle', () => {
    const r = calcularPedido(
      [{ producto_id: 118, modalidad: 'mayor', cantidad: 6 }],
      [producto()],
      { origen: 'catalogo', preciosCatalogo: { 118: 1000 }, entrega: RETIRO },
    );
    expect(r.lineas[0]).toMatchObject({ precio: 1000, precio_lista: 1000, modalidad: 'detalle', ahorro: 0 });
  });
});

describe('POST /api/pedidos — modalidad calculada por el servidor', () => {
  const BODY = {
    nombre_contacto: 'Juana Pérez',
    telefono_contacto: '+569 2094 8874',
    email_contacto: 'juana@example.com',
    entrega_codigo: 'retiro',
    origen: 'productos',
  };
  const post = (items: any[]) => POST(new NextRequest('http://localhost/api/pedidos', {
    method: 'POST',
    body: JSON.stringify({ ...BODY, items }),
    headers: { 'Content-Type': 'application/json' },
  }));
  const txQuery = (fragment: string) => (sqlTransaction.mock.calls[0][0] as any[])
    .find((q) => q?.strings?.join('').includes(fragment));

  let productos: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    productos = [producto()];
    sql.mockImplementation((strings: any, ...values: any[]) => {
      const q = strings.join('');
      if (q.includes('FROM public.productos')) return productos;
      if (q.includes('FROM public.opciones_entrega')) return [RETIRO];
      if (q.includes('SELECT id, email FROM public.clientes')) return [{ id: 'cli-1', email: 'x@y.cl' }];
      if (q.includes('UPDATE public.clientes') || q.includes('INSERT INTO public.clientes')) return [];
      return { strings, values };
    });
    sqlTransaction.mockImplementation((queries: any[]) => [
      [{ id: 'ped-1', cliente_id: 'cli-1', estado: 'pendiente', created_at: '2026-10-29T12:00:00Z', total: 0 }],
      ...queries.slice(1).map(() => []),
    ]);
  });

  test('cantidad = mínimo → 201, item mayor, precio_lista y descuento', async () => {
    const res = await post([{ producto_id: 118, modalidad: 'unidad', cantidad: 6 }]);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.descuento).toBe(1800);

    const item = txQuery('INSERT INTO public.pedido_items');
    expect(item.values).toEqual(expect.arrayContaining(['mayor', 1200, 1500, 6]));
    const pedido = txQuery('INSERT INTO public.pedidos');
    expect(pedido.values[pedido.values.length - 1]).toBe(7200);
  });

  test('mínimo - 1 → detalle', async () => {
    await post([{ producto_id: 118, modalidad: 'unidad', cantidad: 5 }]);
    const item = txQuery('INSERT INTO public.pedido_items');
    expect(item.values).toEqual(expect.arrayContaining(['detalle', 1500]));
  });

  test('líneas repetidas que suman el mínimo → se agrupan en una línea mayor', async () => {
    await post([
      { producto_id: 118, modalidad: 'unidad', cantidad: 3 },
      { producto_id: 118, modalidad: 'unidad', cantidad: 3 },
    ]);
    const inserts = (sqlTransaction.mock.calls[0][0] as any[])
      .filter((q) => q?.strings?.join('').includes('INSERT INTO public.pedido_items'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toEqual(expect.arrayContaining(['mayor', 1200, 6]));
  });

  test('modalidad "mayor" del cliente con cantidad 1 → detalle y 201', async () => {
    const res = await post([{ producto_id: 118, modalidad: 'mayor', cantidad: 1 }]);
    expect(res.status).toBe(201);
    expect(txQuery('INSERT INTO public.pedido_items').values).toEqual(expect.arrayContaining(['detalle', 1500]));
  });

  test('modalidad omitida se acepta; cantidad decide', async () => {
    const res = await post([{ producto_id: 118, cantidad: 6 }]);
    expect(res.status).toBe(201);
    expect(txQuery('INSERT INTO public.pedido_items').values).toEqual(expect.arrayContaining(['mayor']));
  });

  test('minimo_mayor o precio_mayor nulos → detalle', async () => {
    productos = [producto({ minimo_mayor: null })];
    const res = await post([{ producto_id: 118, cantidad: 50 }]);
    expect(res.status).toBe(201);
    expect(txQuery('INSERT INTO public.pedido_items').values).toEqual(expect.arrayContaining(['detalle', 1500]));
  });
});

describe('preferencia con precio especial', () => {
  test('línea mayor: title con sufijo y unit_price cobrado', () => {
    const items = construirItemsPreferencia([
      { producto_id: 118, codigo: '1055', detalle: 'Gallinita', cantidad: 6, precio: 1200, modalidad: 'mayor' },
      { producto_id: 119, codigo: '2001', detalle: 'Otra', cantidad: 1, precio: 1500, modalidad: 'detalle' },
    ], 0);
    expect(items[0]).toEqual({
      id: '118', title: 'Gallinita - precio especial por mayor',
      quantity: 6, unit_price: 1200, currency_id: 'CLP',
    });
    expect(items[1].title).toBe('Otra');
  });
});
