/**
 * @jest-environment node
 *
 * Fase B — Slice 7e: POST/GET pedidos con email, entrega, total y precios
 * SIEMPRE server-side. Tests que intentan romper el contrato.
 */

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/pedidos/route';

const getServerSession = jest.fn();
const sql = jest.fn();
const sqlTransaction = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

// Este archivo cubre el camino SIN pago online; el camino con pago online está en
// pedidos-reserva.test.ts y pedidos-mercadopago.test.ts. No depender del JSON real.
jest.mock('@/config/feature-flags.json', () => ({ 'tienda-pago-online': false }));

jest.mock('@/lib/db', () => {
  const mockSql = (...args: any[]) => sql(...args);
  mockSql.transaction = (...args: any[]) => sqlTransaction(...args);
  return { sql: mockSql };
});

function postReq(body: any): NextRequest {
  return new NextRequest('http://localhost/api/pedidos', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const PRODUCTO = {
  id: 118, codigo: '1055', detalle: 'gallinita', prcventa: 1500,
  precio_mayor: 12000, cantcaja: 6, activo: true, costo: 100,
};
const RETIRO = { codigo: 'retiro', costo: 0, requiere_direccion: false, activa: true };
const DELIVERY = { codigo: 'delivery_iquique', costo: 3000, requiere_direccion: true, activa: true };

const VALID_BODY = {
  nombre_contacto: 'Juana Pérez',
  telefono_contacto: '+591 700 12345',
  email_contacto: 'juana@example.com',
  entrega_codigo: 'retiro',
  origen: 'productos',
  items: [{ producto_id: 118, modalidad: 'unidad', cantidad: 2 }],
};

let productos: any[];
let productosCatalogo: any[];
let opcion: any;
let catalogo: any;
let overrides: any[];
let cliente: any;
let raceOnInsert: boolean;

function setupSql() {
  sql.mockImplementation((strings: any, ...values: any[]) => {
    const q = strings.join('');
    if (q.includes('FROM public.productos')) return productos;
    if (q.includes('FROM productos p')) return productosCatalogo;
    if (q.includes('SELECT DISTINCT UPPER(codigo)')) return [];
    if (q.includes('FROM public.opciones_entrega')) return opcion ? [opcion] : [];
    if (q.includes('FROM public.catalogos')) return catalogo ? [catalogo] : [];
    if (q.includes('FROM public.catalogo_precio_override')) return overrides;
    if (q.includes('SELECT id, email FROM public.clientes')) return cliente ? [cliente] : [];
    if (q.includes('INSERT INTO public.clientes')) {
      if (raceOnInsert) throw { code: '23505' };
      return [{ id: 'cli-nuevo' }];
    }
    if (q.includes('SELECT id FROM public.clientes')) return [{ id: 'a91c-0000' }];
    if (q.includes('UPDATE public.clientes')) return [];
    return { strings, values }; // fragmentos de la transacción
  });
  sqlTransaction.mockImplementation((queries: any[]) => [
    [{ id: 'b3f1-0000', cliente_id: 'a91c-0000', estado: 'pendiente', created_at: '2026-08-17T20:10:00Z', total: 3000 }],
    ...queries.slice(1).map(() => []),
  ]);
}

function txQuery(fragment: string) {
  const queries = sqlTransaction.mock.calls[0][0] as any[];
  return queries.find((q) => q?.strings?.join('').includes(fragment));
}

describe('POST /api/pedidos — validaciones', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    productos = [PRODUCTO];
    productosCatalogo = [{ codigo: '1055', detalle: 'gallinita', costo: 100, saldo: 10 }];
    opcion = RETIRO;
    catalogo = null;
    overrides = [];
    cliente = { id: 'a91c-0000', email: 'existente@example.com' };
    raceOnInsert = false;
    setupSql();
  });

  test.each([
    ['nombre_contacto vacío', { nombre_contacto: '   ' }],
    ['telefono_contacto vacío', { telefono_contacto: '' }],
    ['email vacío', { email_contacto: '' }],
    ['email sin @', { email_contacto: 'no-es-email' }],
    ['entrega_codigo vacío', { entrega_codigo: '' }],
    ['items vacío', { items: [] }],
    ['cantidad <= 0', { items: [{ producto_id: 118, modalidad: 'unidad', cantidad: 0 }] }],
    ['modalidad inválida', { items: [{ producto_id: 118, modalidad: 'docena', cantidad: 1 }] }],
    ['origen inválido', { origen: 'otro' }],
    ['origen catalogo sin slug', { origen: 'catalogo' }],
  ])('%s → 400 sin tocar DB', async (_label, over) => {
    const res = await POST(postReq({ ...VALID_BODY, ...over }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  test('producto inexistente → 400, no inserta nada', async () => {
    productos = [];
    const res = await POST(postReq(VALID_BODY));
    expect(res.status).toBe(400);
    expect(sqlTransaction).not.toHaveBeenCalled();
  });

  test('opción de entrega inexistente → 400', async () => {
    opcion = null;
    const res = await POST(postReq(VALID_BODY));
    expect(res.status).toBe(400);
    expect(sqlTransaction).not.toHaveBeenCalled();
  });

  test('caja sin precio_mayor → 400 sin escritura', async () => {
    productos = [{ ...PRODUCTO, precio_mayor: null }];
    const res = await POST(postReq({
      ...VALID_BODY,
      items: [{ producto_id: 118, modalidad: 'caja', cantidad: 1 }],
    }));
    expect(res.status).toBe(400);
    expect(sqlTransaction).not.toHaveBeenCalled();
  });

  test('delivery sin direccion_entrega → 400 sin escritura', async () => {
    opcion = DELIVERY;
    const res = await POST(postReq({ ...VALID_BODY, entrega_codigo: 'delivery_iquique' }));
    expect(res.status).toBe(400);
    expect(sqlTransaction).not.toHaveBeenCalled();
  });
});

describe('POST /api/pedidos — precios server-side', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    productos = [PRODUCTO];
    productosCatalogo = [{ codigo: '1055', detalle: 'gallinita', costo: 100, saldo: 10 }];
    opcion = RETIRO;
    catalogo = null;
    overrides = [];
    cliente = { id: 'a91c-0000', email: 'existente@example.com' };
    raceOnInsert = false;
    setupSql();
  });

  test('ignora precio/subtotal/total/entrega_costo del body y guarda los reales', async () => {
    const res = await POST(postReq({
      ...VALID_BODY,
      total: 1,
      entrega_costo: 999,
      items: [{ producto_id: 118, modalidad: 'unidad', cantidad: 2, precio: 1, subtotal: 1 }],
    }));
    expect(res.status).toBe(201);

    const item = txQuery('INSERT INTO public.pedido_items');
    expect(item.values).toEqual(expect.arrayContaining([1500]));

    const pedido = txQuery('INSERT INTO public.pedidos');
    expect(pedido.values[pedido.values.length - 1]).toBe(3000); // 2 * 1500
    expect(pedido.values).toContain(0); // entrega_costo real de retiro
  });

  test('caja cobra precio_mayor y guarda modalidad', async () => {
    const res = await POST(postReq({
      ...VALID_BODY,
      items: [{ producto_id: 118, modalidad: 'caja', cantidad: 2, precio: 1 }],
    }));
    expect(res.status).toBe(201);

    const item = txQuery('INSERT INTO public.pedido_items');
    expect(item.values).toEqual(expect.arrayContaining(['caja', 12000]));
  });

  test('origen catalogo usa la misma fórmula que la página (costo + margen)', async () => {
    catalogo = { id: 5, margen_precio: '30' };
    const res = await POST(postReq({
      ...VALID_BODY,
      origen: 'catalogo',
      origen_slug: 'juguetes',
      items: [{ producto_id: 118, modalidad: 'unidad', cantidad: 1, precio: 1 }],
    }));
    expect(res.status).toBe(201);

    const item = txQuery('INSERT INTO public.pedido_items');
    expect(item.values).toEqual(expect.arrayContaining([130])); // ceil(100 * 1.3)
  });

  test('producto fuera del catálogo → 400 "producto no pertenece al catalogo"', async () => {
    catalogo = { id: 5, margen_precio: '30', empresa_id: 1, solo_stock: false };
    productosCatalogo = [{ codigo: '9999', detalle: 'otro', costo: 100, saldo: 10 }];
    const res = await POST(postReq({
      ...VALID_BODY,
      origen: 'catalogo',
      origen_slug: 'juguetes',
    }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('producto no pertenece al catalogo');
    expect(sqlTransaction).not.toHaveBeenCalled();
  });

  test('producto dentro del catálogo por palabras clave → 201 con precio de catálogo', async () => {
    catalogo = {
      id: 5, margen_precio: '30', empresa_id: 1, solo_stock: false,
      palabras_incluir: 'gallinita', palabras_excluir: '',
    };
    productosCatalogo = [{ codigo: '1055', detalle: 'gallinita', costo: 100, saldo: 10 }];
    sql.mockImplementation(((strings: any, ...values: any[]) => {
      const q = strings.join('');
      if (q.includes('SELECT DISTINCT UPPER(codigo)')) return [{ codigo: '1055' }];
      if (q.includes('FROM productos p')) return productosCatalogo;
      if (q.includes('FROM public.productos')) return productos;
      if (q.includes('FROM public.opciones_entrega')) return [RETIRO];
      if (q.includes('FROM public.catalogos')) return [catalogo];
      if (q.includes('FROM public.catalogo_precio_override')) return [];
      if (q.includes('SELECT id, email FROM public.clientes')) return [{ id: 'a91c-0000', email: 'x@y.cl' }];
      if (q.includes('UPDATE public.clientes') || q.includes('INSERT INTO public.clientes')) return [];
      return { strings, values };
    }) as any);

    const res = await POST(postReq({
      ...VALID_BODY,
      origen: 'catalogo',
      origen_slug: 'juguetes',
    }));
    expect(res.status).toBe(201);

    const item = txQuery('INSERT INTO public.pedido_items');
    expect(item.values).toEqual(expect.arrayContaining([130]));
  });

  test('producto del catálogo con costo NULL y sin override → 400', async () => {
    catalogo = { id: 5, margen_precio: '30', empresa_id: 1, solo_stock: false };
    productos = [{ ...PRODUCTO, costo: null }];
    const res = await POST(postReq({
      ...VALID_BODY,
      origen: 'catalogo',
      origen_slug: 'juguetes',
    }));

    expect(res.status).toBe(400);
    expect(sqlTransaction).not.toHaveBeenCalled();
  });

  test('origen catalogo respeta el override del catálogo', async () => {
    catalogo = { id: 5, margen_precio: '30' };
    overrides = [{ codigo: '1055', precio: '999.5' }];
    await POST(postReq({
      ...VALID_BODY,
      origen: 'catalogo',
      origen_slug: 'juguetes',
      items: [{ producto_id: 118, modalidad: 'unidad', cantidad: 1 }],
    }));

    const item = txQuery('INSERT INTO public.pedido_items');
    expect(item.values).toEqual(expect.arrayContaining([1000]));
  });
});

describe('POST /api/pedidos — cliente por teléfono y email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    productos = [PRODUCTO];
    productosCatalogo = [{ codigo: '1055', detalle: 'gallinita', costo: 100, saldo: 10 }];
    opcion = RETIRO;
    catalogo = null;
    overrides = [];
    raceOnInsert = false;
    setupSql();
  });

  test('teléfono existente sin email → completa clientes.email sin sobrescribir nombre', async () => {
    cliente = { id: 'a91c-0000', email: null };
    const res = await POST(postReq(VALID_BODY));
    expect(res.status).toBe(201);

    const update = sql.mock.calls.find((c: any[]) => c[0].join('').includes('UPDATE public.clientes'));
    expect(update[1]).toBe('juana@example.com');
    expect(update[0].join('')).toMatch(/email IS NULL/);
  });

  test('teléfono existente con email → NO se sobrescribe', async () => {
    cliente = { id: 'a91c-0000', email: 'otro@example.com' };
    await POST(postReq(VALID_BODY));

    const update = sql.mock.calls.find((c: any[]) => c[0].join('').includes('UPDATE public.clientes'));
    expect(update).toBeUndefined();
  });

  test('match por dígitos exactos → 201 sin crear cliente nuevo', async () => {
    cliente = { id: 'a91c-0000', email: 'existente@example.com' };
    const res = await POST(postReq({ ...VALID_BODY, telefono_contacto: '+569 2094 8874' }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.cliente_id).toBe('a91c-0000');
    expect(body.data.estado).toBe('pendiente');
    expect(body.data.total).toBe(3000);

    const matchQuery = sql.mock.calls.find((c: any[]) => c[0].join('').includes('SELECT id, email FROM public.clientes'));
    expect(matchQuery[0].join('')).toMatch(/regexp_replace\(telefono, '\[\^0-9\]'/);
    expect(sqlTransaction.mock.calls[0][0].length).toBe(2);
  });

  test('sin match → inserta cliente con email + pedido + items → 201', async () => {
    cliente = null;
    const res = await POST(postReq(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.cliente_id).toBe('a91c-0000');
    const insert = sql.mock.calls.find((c: any[]) => c[0].join('').includes('INSERT INTO public.clientes'));
    expect(insert[2]).toBe('Juana Pérez');
    expect(insert[4]).toBe('juana@example.com');
    expect(sqlTransaction.mock.calls[0][0].length).toBe(2);
  });

  test('concurrente: INSERT cliente choca 23505 → reutiliza el existente', async () => {
    cliente = null;
    raceOnInsert = true;
    const res = await POST(postReq(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.cliente_id).toBe('a91c-0000');
  });
});

describe('GET /api/pedidos — staff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sin sesión → 401', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/api/pedidos'));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  test('rol bodeguero → 403', async () => {
    getServerSession.mockResolvedValue({ user: { rol: 'bodeguero' } });
    const res = await GET(new NextRequest('http://localhost/api/pedidos'));
    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  test('con sesión válida → entrega, email y total con ítems modalidad/subtotal', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });
    sql
      .mockResolvedValueOnce([]) // fragmento condicional anidado
      .mockResolvedValueOnce([{
        id: 'b3f1-0000', cliente_id: 'a91c-0000', origen: 'productos', origen_slug: null,
        estado: 'pendiente', created_at: '2026-08-17T20:10:00Z',
        email_contacto: 'juana@example.com', entrega_codigo: 'delivery_iquique',
        entrega_costo: 3000, direccion_entrega: 'Calle 1', total: 6000,
        nombre: 'Juana Pérez', telefono: '+591 700 12345',
      }])
      .mockResolvedValueOnce([{
        pedido_id: 'b3f1-0000', codigo: '1055', detalle: 'gallinita', cantidad: 2,
        modalidad: 'unidad', precio: 1500, subtotal: 3000, cantcaja: 30,
      }]);

    const res = await GET(new NextRequest('http://localhost/api/pedidos'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data[0]).toMatchObject({
      email_contacto: 'juana@example.com',
      entrega_codigo: 'delivery_iquique',
      entrega_costo: 3000,
      direccion_entrega: 'Calle 1',
      total: 6000,
    });
    expect(body.data[0].items).toEqual([{
      codigo: '1055', detalle: 'gallinita', cantidad: 2,
      modalidad: 'unidad', precio: 1500, subtotal: 3000, cantcaja: 30,
    }]);
  });

  test('producto borrado tras el pedido → item se conserva con cantcaja null', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });
    sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'b3f1-0000', cliente_id: 'a91c-0000', origen: 'productos', origen_slug: null,
        estado: 'pendiente', created_at: '2026-08-17T20:10:00Z',
        email_contacto: null, entrega_codigo: 'retiro', entrega_costo: 0,
        direccion_entrega: null, total: 3000,
        nombre: 'Juana Pérez', telefono: '+591 700 12345',
      }])
      .mockResolvedValueOnce([{
        pedido_id: 'b3f1-0000', codigo: '1055', detalle: 'gallinita', cantidad: 2,
        modalidad: 'unidad', precio: 1500, subtotal: 3000, cantcaja: null,
      }]);

    const res = await GET(new NextRequest('http://localhost/api/pedidos'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data[0].items[0].cantcaja).toBeNull();
  });

  test('expone campos de Mercado Pago (10e)', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });
    sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'b3f1-0000', cliente_id: null, origen: 'productos', origen_slug: null,
        estado: 'revision', created_at: '2026-08-17T20:10:00Z',
        email_contacto: null, entrega_codigo: 'retiro', entrega_costo: 0,
        direccion_entrega: null, total: 3000, nombre: null, telefono: null,
        mp_payment_id: '999', mp_fecha_pago: '2026-08-17T21:00:00Z', mp_revision_motivo: 'Monto distinto',
      }])
      .mockResolvedValueOnce([]);

    const res = await GET(new NextRequest('http://localhost/api/pedidos'));
    const body = await res.json();

    expect(body.data[0]).toMatchObject({
      mp_payment_id: '999', mp_fecha_pago: '2026-08-17T21:00:00Z', mp_revision_motivo: 'Monto distinto',
    });
    expect(sql.mock.calls[1][0].join('')).toMatch(/mp_revision_motivo/);
  });

  test('con ?estado=pendiente filtra la query', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'vendedor' } });
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await GET(new NextRequest('http://localhost/api/pedidos?estado=pendiente'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(sql.mock.calls[0][0].join('')).toMatch(/estado/);
  });
});
