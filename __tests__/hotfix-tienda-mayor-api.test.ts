/**
 * @jest-environment node
 *
 * Fase B — Hotfix "bloquear precio mayor en tienda online".
 * Puntos 1 (bloqueo en POST) y 2 (smoke flujo unidad intacto).
 * Flag `tienda-mayor-online` mockeado explícitamente (lección BUG-004).
 */
import { NextRequest } from 'next/server';

const sql = jest.fn();
const sqlTransaction = jest.fn();

jest.mock('@/config/feature-flags.json', () => ({
  'tienda-pago-online': false,
  'tienda-mayor-online': false,
}));

jest.mock('@/lib/db', () => {
  const mockSql = (...args: any[]) => sql(...args);
  mockSql.transaction = (...args: any[]) => sqlTransaction(...args);
  return { sql: mockSql };
});

import { POST } from '@/app/api/pedidos/route';

const postReq = (body: any) => new NextRequest('http://localhost/api/pedidos', {
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' },
});

const PRODUCTO = {
  id: 118, codigo: '1055', detalle: 'gallinita', prcventa: 1500,
  precio_mayor: 12000, cantcaja: 6, activo: true, costo: 100, saldo: 50,
};
const RETIRO = { codigo: 'retiro', costo: 0, requiere_direccion: false, activa: true };

const BASE = {
  nombre_contacto: 'Juana Pérez',
  telefono_contacto: '+569 2094 8874',
  email_contacto: 'juana@example.com',
  entrega_codigo: 'retiro',
  origen: 'productos',
};

const MENSAJE = 'El precio por mayor no está disponible en la tienda online';

beforeEach(() => {
  jest.clearAllMocks();
  sql.mockImplementation((strings: any, ...values: any[]) => {
    const q = strings.join('');
    if (q.includes('FROM public.productos')) return [PRODUCTO];
    if (q.includes('FROM public.opciones_entrega')) return [RETIRO];
    if (q.includes('SELECT id, email FROM public.clientes')) return [{ id: 'cli-1', email: 'x@y.cl' }];
    if (q.includes('UPDATE public.clientes')) return [];
    return { strings, values };
  });
  sqlTransaction.mockImplementation((queries: any[]) => [
    [{ id: 'ped-1', cliente_id: 'cli-1', estado: 'pendiente', created_at: '2026-10-29T12:00:00Z', total: 3000 }],
    ...queries.slice(1).map(() => []),
  ]);
});

describe('POST /api/pedidos — bloqueo de modalidad caja (flag tienda-mayor-online=false)', () => {
  test('item caja → 400 con el mensaje del contrato, sin insertar pedido ni tocar stock', async () => {
    const res = await POST(postReq({
      ...BASE,
      items: [{ producto_id: 118, modalidad: 'caja', cantidad: 1 }],
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: MENSAJE });
    // Ninguna consulta: no se lee producto, no se inserta pedido, no hay UPDATE de saldo.
    expect(sql).not.toHaveBeenCalled();
    expect(sqlTransaction).not.toHaveBeenCalled();
  });

  test('mezcla unidad + caja → 400 y tampoco escribe', async () => {
    const res = await POST(postReq({
      ...BASE,
      items: [
        { producto_id: 118, modalidad: 'unidad', cantidad: 1 },
        { producto_id: 118, modalidad: 'caja', cantidad: 1 },
      ],
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: MENSAJE });
    expect(sql).not.toHaveBeenCalled();
    expect(sqlTransaction).not.toHaveBeenCalled();
  });
});

describe('POST /api/pedidos — smoke flujo unidad intacto', () => {
  test('items unidad → 201 con precio prcventa y total server-side', async () => {
    const res = await POST(postReq({
      ...BASE,
      items: [{ producto_id: 118, modalidad: 'unidad', cantidad: 2 }],
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toMatchObject({ id: 'ped-1', estado: 'pendiente' });
    expect(sqlTransaction).toHaveBeenCalledTimes(1);

    const queries = sqlTransaction.mock.calls[0][0] as any[];
    const itemInsert = queries.find((q) => q?.strings?.join('').includes('INSERT INTO public.pedido_items'));
    expect(itemInsert).toBeDefined();
    // precio = prcventa (1500), subtotal = 3000
    expect(itemInsert.values).toEqual(expect.arrayContaining([1500, 'detalle', 2]));
  });
});
