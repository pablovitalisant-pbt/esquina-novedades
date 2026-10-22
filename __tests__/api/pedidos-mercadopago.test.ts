/**
 * @jest-environment node
 *
 * Fase B — Slice 9c: POST /api/pedidos con `tienda-pago-online=true`.
 * Intenta romper: preflight sin config (503 sin reservar), preferencia creada
 * desde DB con idempotencyKey, fallo de MP libera stock y da 502, replay sin
 * segunda preferencia. SDK mockeado: nunca sale a la red.
 */
import { NextRequest } from 'next/server';

const mockCreatePreference = jest.fn();
const sql = jest.fn();
const sqlTransaction = jest.fn();

jest.mock('@/config/feature-flags.json', () => ({ 'tienda-pago-online': true }));
jest.mock('@/lib/db', () => {
  const mockSql = (...args: any[]) => sql(...args);
  mockSql.transaction = (...args: any[]) => sqlTransaction(...args);
  return { sql: mockSql };
});
jest.mock('mercadopago', () => ({
  __esModule: true,
  default: class { constructor(_: any) {} },
  Preference: class { create(args: any) { return mockCreatePreference(args); } },
}));

import { POST } from '@/app/api/pedidos/route';

const postReq = (body: any, headers: Record<string, string> = {}) => new NextRequest(
  'http://localhost/api/pedidos',
  { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } },
);

const PRODUCTO = {
  id: 118, codigo: '1055', detalle: 'Gallinita', prcventa: 1500,
  precio_mayor: 12000, cantcaja: 6, activo: true, costo: 100, saldo: 20,
};
const RETIRO = { codigo: 'retiro', nombre: 'Retiro en tienda', costo: 0, requiere_direccion: false, activa: true };
const BODY = {
  nombre_contacto: 'Juana Pérez', telefono_contacto: '+569 2094 8874',
  email_contacto: 'juana@example.com', entrega_codigo: 'retiro', origen: 'productos',
  items: [{ producto_id: 118, modalidad: 'unidad', cantidad: 1 }],
};
const PEDIDO_DB = {
  id: 'ped-1', email_contacto: 'juana@example.com', entrega_codigo: 'retiro',
  entrega_costo: 0, entrega_nombre: 'Retiro en tienda', expira_en: '2026-10-24T12:00:00.000Z',
};
let pedidoExistente: any;
let configCuenta: any;

function setupSql() {
  sql.mockImplementation((strings: any, ...values: any[]) => {
    const q = strings.join('');
    if (q.includes('WITH vencidos')) return [{ liberados: 0, unidades: 0 }];
    if (q.includes('FROM public.caja_config')) return configCuenta;
    if (q.includes('FROM public.caja_cuentas')) return configCuenta.length ? [{ id: 1 }] : [];
    if (q.includes('FROM public.pedidos') && q.includes('idempotency_key')) return pedidoExistente ? [pedidoExistente] : [];
    if (q.includes('FROM public.pedidos p')) return [PEDIDO_DB];
    if (q.includes('FROM public.pedido_items')) {
      return [{ producto_id: 118, codigo: '1055', detalle: 'Gallinita', cantidad: 1, precio: 1500 }];
    }
    if (q.includes("estado = 'rechazado'")) return [{ id: 'ped-1' }];
    if (q.includes('SET mp_preference_id')) return [];
    if (q.includes('FROM public.productos')) return [{ ...PRODUCTO }];
    if (q.includes('FROM public.opciones_entrega')) return [RETIRO];
    if (q.includes('SELECT id, email FROM public.clientes')) return [{ id: 'cli-1', email: 'x@y.cl' }];
    if (q.includes('UPDATE public.clientes')) return [];
    return { strings, values };
  });
}

let envOriginal: NodeJS.ProcessEnv;
beforeEach(() => {
  jest.clearAllMocks();
  envOriginal = { ...process.env };
  process.env.MP_ACCESS_TOKEN = 'TEST-token';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://tienda.example.com';
  pedidoExistente = null;
  configCuenta = [{ valor: '1' }];
  setupSql();
  sqlTransaction.mockImplementation((queries: any[]) => queries.map((_q: any, i: number) => (
    i === 0 ? [{
      id: 'ped-1', cliente_id: 'cli-1', estado: 'pendiente_pago',
      created_at: '2026-10-22T12:00:00Z', total: 1500, expira_en: '2026-10-24T12:00:00Z',
    }] : []
  )));
  mockCreatePreference.mockResolvedValue({
    id: 'pref-1', init_point: 'https://mp/init', sandbox_init_point: 'https://mp/sandbox',
  });
});
afterEach(() => { process.env = envOriginal; });

const llamadaRechazo = () => sql.mock.calls.find((c: any[]) => c[0].join('').includes("estado = 'rechazado'"));

describe('preflight antes de reservar', () => {
  test('sin MP_ACCESS_TOKEN → 503, sin transacción ni SDK', async () => {
    delete process.env.MP_ACCESS_TOKEN;
    const res = await POST(postReq(BODY));
    expect(res.status).toBe(503);
    expect(sqlTransaction).not.toHaveBeenCalled();
    expect(mockCreatePreference).not.toHaveBeenCalled();
  });

  test('sin NEXT_PUBLIC_SITE_URL → 503', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect((await POST(postReq(BODY))).status).toBe(503);
    expect(sqlTransaction).not.toHaveBeenCalled();
  });

  test('sin mp_cuenta_id o cuenta inactiva → 503', async () => {
    configCuenta = [];
    expect((await POST(postReq(BODY))).status).toBe(503);
    configCuenta = [{ valor: '' }];
    expect((await POST(postReq(BODY))).status).toBe(503);
    expect(sqlTransaction).not.toHaveBeenCalled();
  });
});

describe('creación de preferencia', () => {
  test('201 con init point; body desde DB y idempotencyKey = pedido.id', async () => {
    const res = await POST(postReq(BODY));
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.init_point).toBe('https://mp/sandbox'); // token TEST-
    expect(mockCreatePreference).toHaveBeenCalledTimes(1);
    const { body, requestOptions } = mockCreatePreference.mock.calls[0][0];
    expect(requestOptions).toEqual({ idempotencyKey: 'ped-1' });
    expect(body).toMatchObject({
      external_reference: 'ped-1',
      payer: { email: 'juana@example.com' },
      notification_url: 'https://tienda.example.com/api/mercadopago/webhook',
      auto_return: 'approved',
      expires: true,
      expiration_date_to: '2026-10-24T12:00:00.000Z',
    });
    expect(body.items).toEqual([
      { id: '118', title: 'Gallinita', quantity: 1, unit_price: 1500, currency_id: 'CLP' },
    ]);
    const persistencia = sql.mock.calls.find((c: any[]) => c[0].join('').includes('SET mp_preference_id'));
    expect(persistencia[0].join('')).toContain("estado = 'pendiente_pago'");
    expect(persistencia[1]).toBe('pref-1');
    expect(persistencia[2]).toBe('https://mp/sandbox');
    expect(persistencia[0].join('')).toContain('mp_init_point');
    expect(llamadaRechazo()).toBeUndefined();
  });

  test('SDK falla → 502, pedido rechazado y stock devuelto con idempotency_key NULL', async () => {
    mockCreatePreference.mockRejectedValueOnce(new Error('MP caído'));
    const res = await POST(postReq(BODY));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.pedido_id).toBe('ped-1');
    expect(JSON.stringify(json)).not.toContain('MP caído');
    expect(llamadaRechazo()[0].join('')).toContain('idempotency_key = NULL');
    expect(llamadaRechazo()[0].join('')).toContain('COALESCE(p.saldo, 0) + d.unidades');
  });

  test('preferencia sin init point → mismo 502 y liberación', async () => {
    mockCreatePreference.mockResolvedValueOnce({ id: 'pref-1' });
    expect((await POST(postReq(BODY))).status).toBe(502);
    expect(llamadaRechazo()).toBeDefined();
  });
});

describe('replay con Idempotency-Key', () => {
  test('pendiente_pago con mp_init_point → 200, mismo punto, sin SDK', async () => {
    pedidoExistente = { id: 'ped-1', estado: 'pendiente_pago', mp_init_point: 'https://mp/viejo' };
    const res = await POST(postReq(BODY, { 'Idempotency-Key': 'k1' }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.init_point).toBe('https://mp/viejo');
    expect(mockCreatePreference).not.toHaveBeenCalled();
    expect(sqlTransaction).not.toHaveBeenCalled();
  });

  test('pendiente_pago sin init point → crea preferencia y responde 200', async () => {
    pedidoExistente = { id: 'ped-1', estado: 'pendiente_pago', mp_init_point: null };
    const res = await POST(postReq(BODY, { 'Idempotency-Key': 'k1' }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.init_point).toBe('https://mp/sandbox');
    expect(mockCreatePreference).toHaveBeenCalledTimes(1);
    expect(sqlTransaction).not.toHaveBeenCalled();
  });

  test('rechazado → 200 sin init point y sin SDK', async () => {
    pedidoExistente = { id: 'ped-1', estado: 'rechazado', mp_init_point: null };
    const res = await POST(postReq(BODY, { 'Idempotency-Key': 'k1' }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.init_point).toBeUndefined();
    expect(mockCreatePreference).not.toHaveBeenCalled();
  });
});
