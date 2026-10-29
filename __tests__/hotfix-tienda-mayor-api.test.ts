/**
 * @jest-environment node
 *
 * Slice 4b — reemplaza el hotfix "bloquear precio mayor en tienda online".
 * Con flag `tienda-mayor-online` en false la modalidad del cliente se ignora:
 * pedidos con 'caja'/'mayor' responden 201 y se cobran a precio detalle.
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
  precio_mayor: 1200, minimo_mayor: 1, cantcaja: 6, activo: true, costo: 100, saldo: 50,
};
const RETIRO = { codigo: 'retiro', costo: 0, requiere_direccion: false, activa: true };

const BASE = {
  nombre_contacto: 'Juana Pérez',
  telefono_contacto: '+569 2094 8874',
  email_contacto: 'juana@example.com',
  entrega_codigo: 'retiro',
  origen: 'productos',
};

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

const itemInsert = () => (sqlTransaction.mock.calls[0][0] as any[])
  .find((q) => q?.strings?.join('').includes('INSERT INTO public.pedido_items'));

describe('POST /api/pedidos — modalidad del cliente ignorada (flag false)', () => {
  test("item caja → 201 cobrado a precio detalle", async () => {
    const res = await POST(postReq({
      ...BASE,
      items: [{ producto_id: 118, modalidad: 'caja', cantidad: 1 }],
    }));

    expect(res.status).toBe(201);
    expect(itemInsert().values).toEqual(expect.arrayContaining(['detalle', 1500, 1500]));
  });

  test('mezcla unidad + caja → 201 y una sola línea detalle', async () => {
    const res = await POST(postReq({
      ...BASE,
      items: [
        { producto_id: 118, modalidad: 'unidad', cantidad: 1 },
        { producto_id: 118, modalidad: 'caja', cantidad: 1 },
      ],
    }));

    expect(res.status).toBe(201);
    const inserts = (sqlTransaction.mock.calls[0][0] as any[])
      .filter((q) => q?.strings?.join('').includes('INSERT INTO public.pedido_items'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toEqual(expect.arrayContaining(['detalle', 1500, 2]));
  });
});
