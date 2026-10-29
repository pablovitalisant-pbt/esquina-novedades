/**
 * @jest-environment node
 *
 * Fase B — Slice 8b: reserva atómica con `tienda-pago-online=true`.
 * Intenta romper: dos pedidos por el último stock, doble Idempotency-Key,
 * stock insuficiente con rollback total y reserva exitosa (unidades, 36 h).
 */
import { NextRequest } from 'next/server';

const sql = jest.fn();
const sqlTransaction = jest.fn();

jest.mock('@/config/feature-flags.json', () => ({ 'tienda-pago-online': true, 'tienda-mayor-online': false }));
jest.mock('@/lib/pedidos/preferencia', () => ({
  crearPreferenciaPedido: jest.fn(async () => ({
    preferenceId: 'pref-1', initPoint: 'https://mp/sandbox',
  })),
}));
jest.mock('@/lib/db', () => {
  const mockSql = (...args: any[]) => sql(...args);
  mockSql.transaction = (...args: any[]) => sqlTransaction(...args);
  return { sql: mockSql };
});

import { POST } from '@/app/api/pedidos/route';

const postReq = (body: any, headers: Record<string, string> = {}) => new NextRequest(
  'http://localhost/api/pedidos',
  { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } },
);

const PRODUCTO = {
  id: 118, codigo: '1055', detalle: 'gallinita', prcventa: 1500,
  precio_mayor: 12000, cantcaja: 6, activo: true, costo: 100, saldo: 1,
};
const RETIRO = { codigo: 'retiro', costo: 0, requiere_direccion: false, activa: true };
const VALID_BODY = {
  nombre_contacto: 'Juana Pérez', telefono_contacto: '+569 2094 8874',
  email_contacto: 'juana@example.com', entrega_codigo: 'retiro', origen: 'productos',
  items: [{ producto_id: 118, modalidad: 'unidad', cantidad: 1 }],
};

let productos: any[];
let saldoDiagnostico: number;
let pedidoExistente: any;

const setupSql = () => sql.mockImplementation((strings: any, ...values: any[]) => {
  const q = strings.join('');
  if (q.includes('WITH vencidos')) return [{ liberados: 0, unidades: 0 }];
  // Slice 9c: preflight de pago online configurado.
  if (q.includes('FROM public.caja_config')) return [{ valor: '1' }];
  if (q.includes('FROM public.caja_cuentas')) return [{ id: 1 }];
  if (q.includes('FROM public.pedidos') && q.includes('idempotency_key')) return pedidoExistente ? [pedidoExistente] : [];
  if (q.includes('SELECT id, codigo, saldo FROM public.productos')) {
    return productos.map((p) => ({ id: p.id, codigo: p.codigo, saldo: saldoDiagnostico }));
  }
  if (q.includes('FROM public.productos')) return productos;
  if (q.includes('FROM public.opciones_entrega')) return [RETIRO];
  if (q.includes('SELECT id, email FROM public.clientes')) return [{ id: 'cli-1', email: 'x@y.cl' }];
  if (q.includes('UPDATE public.clientes')) return [];
  return { strings, values }; // fragmento de la transacción
});

const txQuery = (fragment: string) => (sqlTransaction.mock.calls[0][0] as any[])
  .find((q) => q?.strings?.join('').includes(fragment));

beforeEach(() => {
  jest.clearAllMocks();
  process.env.MP_ACCESS_TOKEN = 'TEST-token';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://tienda.example.com';
  productos = [{ ...PRODUCTO }];
  saldoDiagnostico = 0;
  pedidoExistente = null;
  setupSql();
  sqlTransaction.mockImplementation((queries: any[]) => queries.map((_q: any, i: number) => (
    i === 0 ? [{ id: 'ped-1', cliente_id: 'cli-1', estado: 'pendiente_pago', created_at: '2026-10-22T12:00:00Z', total: 1500 }] : []
  )));
});

test('reserva: descuenta ambas tablas, guarda unidades y deja pendiente_pago 36 h', async () => {
  productos = [{ ...PRODUCTO, saldo: 20 }];
  const res = await POST(postReq({ ...VALID_BODY, items: [{ producto_id: 118, modalidad: 'unidad', cantidad: 12 }] }));
  expect(res.status).toBe(201);
  expect((await res.json()).data.estado).toBe('pendiente_pago');

  const prod = txQuery('UPDATE public.productos');
  expect(prod.strings.join('')).toMatch(/saldo\s*=\s*saldo\s*-/);
  expect(prod.strings.join('')).toMatch(/saldo\s*>=\s*/);
  // BUG-003: el divisor debe depender de upd; un `1 / 0` constante se pliega al planificar.
  expect(prod.strings.join('')).toMatch(/1\s*\/\s*\(SELECT COUNT\(\*\) FROM upd\)/);
  expect(prod.strings.join('')).not.toMatch(/ELSE\s+1\s*\/\s*0/);
  expect(prod.values).toContain(12); // 12 unidades

  expect(txQuery('UPDATE public.ubicaciones_bodega').values).toContain(12);
  const item = txQuery('INSERT INTO public.pedido_items');
  expect(item.strings.join('')).toMatch(/unidades/);
  expect(item.values).toContain(12);

  const pedido = txQuery('INSERT INTO public.pedidos');
  expect(pedido.strings.join('')).toMatch(/INTERVAL '36 hours'/);
  expect(pedido.values).toContain('pendiente_pago');
  expect(pedido.values).toContain(true);
});

test('libera reservas vencidas antes de tocar stock', async () => {
  await POST(postReq(VALID_BODY));
  const liberar = sql.mock.calls.findIndex((c: any[]) => c[0].join('').includes('WITH vencidos'));
  expect(liberar).toBeGreaterThanOrEqual(0);
  expect(sql.mock.calls.slice(0, liberar).some((c: any[]) => c[0].join('').includes('UPDATE public.productos'))).toBe(false);
});

test('dos pedidos por el último stock: 201 y 409 con detalle', async () => {
  expect((await POST(postReq(VALID_BODY))).status).toBe(201);

  sqlTransaction.mockRejectedValueOnce({ code: '22012' });
  const segunda = await POST(postReq(VALID_BODY));
  expect(segunda.status).toBe(409);
  expect(await segunda.json()).toEqual({
    error: 'Stock insuficiente',
    items: [{ codigo: '1055', disponible: 0, solicitado: 1 }],
  });
});

test('misma Idempotency-Key dos veces: una reserva y el mismo pedido', async () => {
  const primera = await POST(postReq(VALID_BODY, { 'Idempotency-Key': 'doble-clic-1' }));
  const bodyPrimera = await primera.json();
  expect(primera.status).toBe(201);
  expect(sqlTransaction).toHaveBeenCalledTimes(1);

  pedidoExistente = {
    id: bodyPrimera.data.id, cliente_id: 'cli-1', estado: 'pendiente_pago',
    created_at: '2026-10-22T12:00:00Z', total: 1500,
  };
  const segunda = await POST(postReq(VALID_BODY, { 'Idempotency-Key': 'doble-clic-1' }));
  expect(segunda.status).toBe(200);
  expect((await segunda.json()).data.id).toBe(bodyPrimera.data.id);
  expect(sqlTransaction).toHaveBeenCalledTimes(1);
});

test('stock insuficiente: 409 y todo el alta vive en la transacción abortada', async () => {
  sqlTransaction.mockRejectedValueOnce({ code: '22012' });
  expect((await POST(postReq(VALID_BODY))).status).toBe(409);
  expect(sqlTransaction).toHaveBeenCalledTimes(1);
  expect(sqlTransaction.mock.calls[0][0].some(
    (q: any) => q.strings.join('').includes('INSERT INTO public.pedidos'),
  )).toBe(true);
});
