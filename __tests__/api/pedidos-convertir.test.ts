/**
 * @jest-environment node
 *
 * Fase B — 3b-i: POST /api/pedidos/[id]/convertir.
 * Fuerza las condiciones de riesgo: éxito total, éxito parcial (ítem sin
 * stock), pedido ya convertido → 409, 401/403.
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/pedidos/[id]/convertir/route';

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => {
  const mockSql = (...args: any[]) => sql(...args);
  return { sql: mockSql };
});

const CTX = { params: Promise.resolve({ id: 'pedido-1' }) };

function convertReq(): NextRequest {
  return new NextRequest('http://localhost/api/pedidos/pedido-1/convertir', { method: 'POST' });
}

// Mock de sql por contenido. failCodigo hace que el UPDATE de stock de ESE
// codigo devuelva 0 filas (stock insuficiente).
let failCodigo: string | null = null;
let itemsMock: any[] = [];
let cteResults: any[][] | null = null;

function setupSqlMock(pedidoEstado: string, stockReservado = false) {
  sql.mockImplementation((...args: any[]) => {
    const q = args[0].join('');
    // Slice 8d: conversión de pedido con reserva → una sola sentencia CTE que
    // crea la nota + ítems y marca el pedido, sin tocar saldo.
    if (q.includes('INSERT INTO public.prenotas') && q.includes('public.pedido_items')) {
      return cteResults ? cteResults.shift() : [{ prenota_id: 42 }];
    }
    if (q.includes('FROM public.pedidos WHERE id')) {
      return [{ id: 'pedido-1', estado: pedidoEstado, cliente_id: 'c1', stock_reservado: stockReservado }];
    }
    if (q.includes('COUNT(*) FROM public.prenotas')) return [{ count: '0' }];
    if (q.includes('INSERT INTO public.prenotas')) return [{ id: 42 }];
    if (q.includes('FROM public.pedido_items')) return itemsMock;
    // BUG-065: la consulta de productos ahora trae imagen_url junto a cantcaja.
    if (q.includes('SELECT cantcaja')) return [{ cantcaja: 6, imagen_url: `cloud://img-${args[1]}` }];
    if (q.includes('UPDATE public.productos')) {
      const codigo = args[2];
      return codigo === failCodigo ? [] : [{ saldo: 100 }];
    }
    if (q.includes('SELECT saldo FROM public.productos')) return [{ saldo: 1 }];
    if (q.includes('UPDATE public.ubicaciones_bodega')) return [];
    if (q.includes('INSERT INTO public.prenota_items')) return [];
    if (q.includes('UPDATE public.pedidos SET estado')) return [];
    return [];
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  failCodigo = null;
  cteResults = null;
  itemsMock = [
    { codigo: 'A', detalle: 'Producto A', cantidad: 2, precio_referencia: 5, modalidad: 'caja', precio: 1200, unidades: 12 },
    { codigo: 'B', detalle: 'Producto B', cantidad: 1, precio_referencia: 9, modalidad: 'unidad', precio: 900, unidades: 1 },
  ];
});

describe('POST /api/pedidos/[id]/convertir', () => {
  test('sin sesión → 401', async () => {
    getServerSession.mockResolvedValue(null);
    setupSqlMock('pendiente');
    const res = await POST(convertReq(), CTX);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  test('rol bodeguero → 403', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'bodeguero' } });
    setupSqlMock('pendiente');
    const res = await POST(convertReq(), CTX);
    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  test('pedido ya convertido → 409', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
    setupSqlMock('convertido');
    const res = await POST(convertReq(), CTX);
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toMatch(/pendiente/i);
  });

  test('éxito total → crea nota y descuenta stock de todos los ítems', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
    setupSqlMock('pendiente');

    const res = await POST(convertReq(), CTX);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.prenota_id).toBe(42);
    expect(body.data.convertidos).toEqual([
      { codigo: 'A', cajas: 2 },
      { codigo: 'B', cajas: 1 },
    ]);
    expect(body.data.fallidos).toEqual([]);

    // BUG-065: cada INSERT a prenota_items debe llevar la imagen_url del producto
    const inserts = sql.mock.calls.filter((c) => c[0].join('').includes('INSERT INTO public.prenota_items'));
    expect(inserts).toHaveLength(2);
    expect(inserts.map((c) => c[4])).toEqual(['cloud://img-A', 'cloud://img-B']);
  });

  test('éxito parcial → ítem sin stock se omite y sigue, pedido queda convertido', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'vendedor', nombre: 'Vende' } });
    failCodigo = 'A';
    setupSqlMock('pendiente');

    const res = await POST(convertReq(), CTX);
    const body = await res.json();

    expect(res.status).toBe(201);
    // A falla stock (2 cajas × 6 = 12 unidades), B entra
    expect(body.data.convertidos).toEqual([{ codigo: 'B', cajas: 1 }]);
    expect(body.data.fallidos).toEqual([
      { codigo: 'A', motivo: 'Stock insuficiente', disponible: 1, solicitado: 12 },
    ]);
    expect(body.data.prenota_id).toBe(42);
  });

  // ─── Slice 8d: pedido con stock ya reservado ────────────────────────
  test('pedido pagado con stock_reservado=true → crea nota SIN segundo descuento', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
    setupSqlMock('pagado', true);

    const res = await POST(convertReq(), CTX);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.prenota_id).toBe(42);
    expect(body.data.fallidos).toEqual([]);

    // El stock ya salió al reservar: no se toca saldo en ninguna tabla.
    const descuentos = sql.mock.calls.filter((c) => {
      const q = c[0].join('');
      return q.includes('UPDATE public.productos SET saldo = saldo -')
        || q.includes('UPDATE public.ubicaciones_bodega SET saldo = saldo -');
    });
    expect(descuentos).toHaveLength(0);

    // Una sola sentencia atómica: nota + ítems con modalidad/precio/unidades
    // del pedido + pedido marcado (estado y stock_reservado=false).
    const cte = sql.mock.calls.map((c) => c[0].join('')).find((q) =>
      q.includes('INSERT INTO public.prenotas') && q.includes('public.pedido_items'));
    expect(cte).toBeDefined();
    expect(cte).toMatch(/modalidad/);
    expect(cte).toMatch(/pi\.precio/);
    expect(cte).toMatch(/pi\.unidades/);
    expect(cte).toMatch(/stock_reservado = false/);
    expect(cte).toMatch(/estado = 'convertido'/);
  });

  // ─── Slice 8d corrección: lock y defensa de estado ──────────────────
  test('el CTE bloquea la fila con FOR UPDATE y el UPDATE repite estado+reserva', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
    setupSqlMock('pagado', true);

    await POST(convertReq(), CTX);

    const cte = sql.mock.calls.map((c) => c[0].join('')).find((q) =>
      q.includes('INSERT INTO public.prenotas') && q.includes('public.pedido_items')) as string;

    // target: SELECT ... FOR UPDATE (serializa conversiones concurrentes)
    expect(cte).toMatch(/SELECT id FROM public\.pedidos[\s\S]*FOR UPDATE/);
    // upd: defensa redundante contra el snapshot del SELECT
    const upd = cte.match(/UPDATE public\.pedidos[\s\S]*?RETURNING id/)?.[0] ?? '';
    expect(upd).toMatch(/estado = 'pagado'/);
    expect(upd).toMatch(/stock_reservado = true/);
  });

  test('cajas solo para modalidad caja; unidad guarda cajas = 0', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
    itemsMock = [
      { codigo: 'A', detalle: 'A', cantidad: 2, modalidad: 'caja', precio: 0, unidades: 12 },
      { codigo: 'B', detalle: 'B', cantidad: 3, modalidad: 'unidad', precio: 0, unidades: 3 },
    ];
    setupSqlMock('pagado', true);

    const res = await POST(convertReq(), CTX);
    const body = await res.json();

    const cte = sql.mock.calls.map((c) => c[0].join('')).find((q) =>
      q.includes('INSERT INTO public.prenotas') && q.includes('public.pedido_items')) as string;
    expect(cte).toMatch(/CASE WHEN pi\.modalidad = 'caja' THEN pi\.cantidad ELSE 0 END/);
    expect(body.data.convertidos).toEqual([
      { codigo: 'A', cajas: 2 },
      { codigo: 'B', cajas: 0 },
    ]);
  });

  test('doble conversión concurrente → la segunda recibe 409', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
    // El segundo request encuentra el pedido ya convertido: el CTE no inserta.
    cteResults = [[{ prenota_id: 42 }], []];
    setupSqlMock('pagado', true);

    const res1 = await POST(convertReq(), CTX);
    const res2 = await POST(convertReq(), CTX);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(409);
    const body2 = await res2.json();
    expect(body2.error).toMatch(/convertible/i);
  });

  test('pedido expirado → 409 (no convertir)', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
    setupSqlMock('expirado', false);

    const res = await POST(convertReq(), CTX);
    expect(res.status).toBe(409);
    expect(sql.mock.calls.some((c) => c[0].join('').includes('INSERT INTO public.prenotas'))).toBe(false);
  });

  test('pedido pendiente_pago (aún sin pagar) → 409', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
    setupSqlMock('pendiente_pago', true);

    const res = await POST(convertReq(), CTX);
    expect(res.status).toBe(409);
    expect(sql.mock.calls.some((c) => c[0].join('').includes('INSERT INTO public.prenotas'))).toBe(false);
  });
});
