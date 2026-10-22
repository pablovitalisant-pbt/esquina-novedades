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

function setupSqlMock(pedidoEstado: string) {
  sql.mockImplementation((...args: any[]) => {
    const q = args[0].join('');
    if (q.includes('FROM public.pedidos WHERE id')) {
      return [{ id: 'pedido-1', estado: pedidoEstado, cliente_id: 'c1' }];
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
  itemsMock = [
    { codigo: 'A', detalle: 'Producto A', cantidad: 2, precio_referencia: 5 },
    { codigo: 'B', detalle: 'Producto B', cantidad: 1, precio_referencia: 9 },
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
});
