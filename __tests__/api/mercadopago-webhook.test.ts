/**
 * @jest-environment node
 *
 * Fase B — Slice 10d: POST /api/mercadopago/webhook.
 * Firma real (validador del SDK), Payment.get mockeado, lógica de pedidos real sobre sql mockeado.
 */
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const paymentGet = jest.fn();
const sql = jest.fn();
const convertir = jest.fn();

jest.mock('@/lib/db', () => ({ sql: (...a: any[]) => sql(...a) }));
jest.mock('@/lib/pedidos/convertir', () => ({ convertirPedido: (...a: any[]) => convertir(...a) }));
jest.mock('@/lib/pedidos/usuario-sistema', () => ({ usuarioSistema: async () => ({ id: 9, nombre: 'Mercado Pago' }) }));
jest.mock('mercadopago', () => ({
  ...jest.requireActual('mercadopago'),
  __esModule: true,
  default: class { constructor(_: any) {} },
  Payment: class { get(a: any) { return paymentGet(a); } },
}));

// Flag del ciclo IPN legacy (mutable por test vía jest.requireMock). Default ON.
jest.mock('@/config/feature-flags.json', () => ({ 'mp-webhook-ignorar-ipn-legacy': true }));
import { POST } from '@/app/api/mercadopago/webhook/route';

const SECRET = 'secreto-test';
const PEDIDO = '11111111-1111-4111-8111-111111111111';
const q = (c: any[]) => c[0].join('?');
const hubo = (f: string) => sql.mock.calls.some((c) => q(c).includes(f));

function req(o: { dataId?: string; type?: string; sign?: boolean; ts?: number; secret?: string } = {}) {
  const dataId = o.dataId ?? '777';
  const ts = o.ts ?? Math.floor(Date.now() / 1000);
  const rid = 'req-1';
  const h = crypto.createHmac('sha256', o.secret ?? SECRET).update(`id:${dataId};request-id:${rid};ts:${ts};`).digest('hex');
  const headers: Record<string, string> = { 'x-request-id': rid };
  if (o.sign !== false) headers['x-signature'] = `ts=${ts},v1=${h}`;
  return new NextRequest(`http://localhost/api/mercadopago/webhook?data.id=${dataId}&type=${o.type ?? 'payment'}`, {
    method: 'POST', headers, body: JSON.stringify({ type: 'payment', data: { id: dataId }, status: 'approved' }),
  });
}
const pago = (p: any = {}) => ({ id: 777, status: 'approved', transaction_amount: 5000, currency_id: 'CLP', external_reference: PEDIDO, ...p });

function db(estado = 'pendiente_pago', extra: any = {}) {
  sql.mockImplementation(async (...c: any[]) => {
    const t = q(c);
    if (t.includes('SELECT id FROM pedidos')) return [{ id: PEDIDO }];
    if (t.includes('SET mp_payment_id')) return [{ estado, total: 5000, caja_movimiento_id: null, ...extra }];
    if (t.includes('FROM caja_config')) return [{ valor: '3' }];
    if (t.includes('INSERT INTO caja_movimientos')) return [{ id: 'mov' }];
    if (t.includes("SET estado = 'rechazado'")) return [{ id: PEDIDO }];
    return [];
  });
  convertir.mockResolvedValue({ status: 201, body: {} });
}

beforeEach(() => {
  process.env.MP_WEBHOOK_SECRET = SECRET;
  process.env.MP_ACCESS_TOKEN = 'TEST-token';
  sql.mockReset(); paymentGet.mockReset(); convertir.mockReset();
  db();
  paymentGet.mockResolvedValue(pago());
});

test('sin x-signature -> 401, no consulta el pago', async () => {
  expect((await POST(req({ sign: false }))).status).toBe(401);
  expect(paymentGet).not.toHaveBeenCalled();
});
test('firma con otro secreto -> 401 sin tocar nada', async () => {
  expect((await POST(req({ secret: 'otro' }))).status).toBe(401);
  expect(paymentGet).not.toHaveBeenCalled();
  expect(sql).not.toHaveBeenCalled();
});
test('ts fuera de la ventana -> 401', async () => {
  expect((await POST(req({ ts: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(401);
  expect(paymentGet).not.toHaveBeenCalled();
});
test('MP_WEBHOOK_SECRET ausente -> 500', async () => {
  delete process.env.MP_WEBHOOK_SECRET;
  expect((await POST(req())).status).toBe(500);
  expect(paymentGet).not.toHaveBeenCalled();
});
test('type distinto de payment -> 200 sin Payment.get', async () => {
  expect((await POST(req({ type: 'merchant_order' }))).status).toBe(200);
  expect(paymentGet).not.toHaveBeenCalled();
});
test('external_reference no UUID -> 200 ignorado, sin consultar DB', async () => {
  paymentGet.mockResolvedValue(pago({ external_reference: 'abc' }));
  expect((await POST(req())).status).toBe(200);
  expect(sql).not.toHaveBeenCalled();
});
test('pedido inexistente -> 200', async () => {
  sql.mockResolvedValue([]);
  expect((await POST(req())).status).toBe(200);
  expect(convertir).not.toHaveBeenCalled();
});
test('approved válido -> convierte y cobra una vez; replay no duplica cobro', async () => {
  expect((await POST(req())).status).toBe(200);
  expect(convertir).toHaveBeenCalledTimes(1);
  expect(sql.mock.calls.filter((c) => q(c).includes('INSERT INTO caja_movimientos'))).toHaveLength(1);
  sql.mockReset(); convertir.mockReset(); db('convertido', { caja_movimiento_id: 'mov' });
  expect((await POST(req())).status).toBe(200);
  expect(convertir).not.toHaveBeenCalled();
  expect(hubo('INSERT INTO caja_movimientos')).toBe(false);
});
test('approved con monto distinto (el body miente) -> revision, sin convertir', async () => {
  paymentGet.mockResolvedValue(pago({ transaction_amount: 1 }));
  expect((await POST(req())).status).toBe(200);
  expect(hubo("estado = 'revision'")).toBe(true);
  expect(convertir).not.toHaveBeenCalled();
});
test('rejected/cancelled -> 200, el pedido no cambia (intento fallido)', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  for (const status of ['rejected', 'cancelled']) {
    sql.mockClear();
    paymentGet.mockResolvedValue(pago({ status }));
    expect((await POST(req())).status).toBe(200);
    expect(hubo("estado = 'rechazado'")).toBe(false);
    expect(hubo('UPDATE')).toBe(false);
  }
  warn.mockRestore();
});
test('rejected y luego approved del mismo pedido -> termina convertido, una sola conversión', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  paymentGet.mockResolvedValueOnce(pago({ id: 1, status: 'rejected' }));
  expect((await POST(req({ dataId: '1' }))).status).toBe(200);
  expect(convertir).not.toHaveBeenCalled();
  paymentGet.mockResolvedValueOnce(pago({ id: 2, status: 'approved' }));
  expect((await POST(req({ dataId: '2' }))).status).toBe(200);
  expect(convertir).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});
test('pending/in_process -> sin cambios', async () => {
  for (const status of ['pending', 'in_process']) {
    sql.mockClear();
    paymentGet.mockResolvedValue(pago({ status }));
    expect((await POST(req())).status).toBe(200);
    expect(hubo('UPDATE')).toBe(false);
  }
});
test('pago inexistente en MP (404) -> 200 sin tocar la DB, para que MP no reintente', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  paymentGet.mockRejectedValue(Object.assign(new Error('Payment not found'), { status: 404, error: 'not_found' }));
  expect((await POST(req())).status).toBe(200);
  expect(sql).not.toHaveBeenCalled();
  expect(convertir).not.toHaveBeenCalled();
  warn.mockRestore();
});
test('Payment.get con error 5xx de MP -> 500 (MP debe reintentar)', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  paymentGet.mockRejectedValue(Object.assign(new Error('internal'), { status: 502 }));
  expect((await POST(req())).status).toBe(500);
  log.mockRestore();
});test('Payment.get lanza -> 500, sin cambios', async () => {
  paymentGet.mockRejectedValue(new Error('boom'));
  expect((await POST(req())).status).toBe(500);
  expect(hubo('UPDATE')).toBe(false);
});
test('error de DB -> 500 y el secreto no se loguea', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  sql.mockRejectedValue(new Error('db'));
  expect((await POST(req())).status).toBe(500);
  expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET);
  log.mockRestore();
});

// ─── Ciclo IPN legacy: notificaciones "MercadoPago Feed v2.0" (?id=&topic=) ───
const flagsMock = jest.requireMock('@/config/feature-flags.json') as Record<string, boolean>;
function ipn(qs: string) {
  return new NextRequest(`http://localhost/api/mercadopago/webhook?${qs}`, {
    method: 'POST', headers: { 'user-agent': 'MercadoPago Feed v2.0 payment' },
    body: JSON.stringify({ resource: '184708163551', topic: 'payment' }),
  });
}
describe('IPN legacy sin data.id ni firma', () => {
  afterEach(() => { flagsMock['mp-webhook-ignorar-ipn-legacy'] = true; });
  test('topic=payment con flag ON -> 200 sin Payment.get ni SQL', async () => {
    const res = await POST(ipn('id=184708163551&topic=payment'));
    expect(res.status).toBe(200);
    expect(paymentGet).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });
  test('topic=merchant_order con flag ON -> 200 sin efectos', async () => {
    const res = await POST(ipn('id=45497450319&topic=merchant_order'));
    expect(res.status).toBe(200);
    expect(paymentGet).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });
  test('flag OFF -> 401 como antes', async () => {
    flagsMock['mp-webhook-ignorar-ipn-legacy'] = false;
    expect((await POST(ipn('id=184708163551&topic=payment'))).status).toBe(401);
    expect(paymentGet).not.toHaveBeenCalled();
  });
  test('sin data.id y sin topic -> 401 aunque el flag esté ON', async () => {
    expect((await POST(ipn('id=184708163551'))).status).toBe(401);
    expect(paymentGet).not.toHaveBeenCalled();
  });
  test('topic con data.id presente -> sigue exigiendo firma (401 sin firma)', async () => {
    expect((await POST(ipn('data.id=184708163551&topic=payment'))).status).toBe(401);
    expect(paymentGet).not.toHaveBeenCalled();
  });
  test('smoke: notificación firmada sigue procesando con flag ON', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(paymentGet).toHaveBeenCalledTimes(1);
    expect(convertir).toHaveBeenCalledTimes(1);
  });
});