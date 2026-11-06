/** @jest-environment node */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
const sql = jest.fn();
const crearPreferencia = jest.fn();
const envOriginal = { ...process.env };
jest.mock('@/config/feature-flags.json', () => require('@/__tests__/helpers/mockFlags').mockFlags({
  'tienda-pago-online': true,
  'pedido-pago-opcional': false,
}));
jest.mock('@/lib/db', () => {
  const mockSql = (...args: unknown[]) => sql(...args);
  return { sql: mockSql };
});
jest.mock('@/lib/pedidos/preferencia', () => ({
  crearPreferenciaPedido: (...args: unknown[]) => crearPreferencia(...args),
}));
import { POST } from '@/app/api/pedidos/[id]/pagar/route';
type Pedido = { id: string; estado: string; stock_reservado: boolean; expira_en: string; mp_init_point: string | null };
const flagsTest = () => require('@/config/feature-flags.json') as Record<string, boolean>;
const ID = randomUUID();
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (id: string = ID) => new NextRequest(`http://localhost/api/pedidos/${id}/pagar`, { method: 'POST' });
let pedido: Pedido | null;
let configCuenta: { valor: string }[];
let cuentaActiva: { id: number }[];
const setupSql = () => sql.mockImplementation((strings: string[]) => {
  const q = strings.join('');
  if (q.includes('FROM public.caja_config')) return configCuenta;
  if (q.includes('FROM public.caja_cuentas')) return cuentaActiva;
  if (q.includes('FROM public.pedidos')) return pedido ? [pedido] : [];
  return [];
});
beforeEach(() => {
  jest.clearAllMocks();
  flagsTest()['pedido-pago-opcional'] = true;
  Object.assign(process.env, { MP_ACCESS_TOKEN: 'TEST-token', NEXT_PUBLIC_SITE_URL: 'https://tienda.example.com' });
  pedido = { id: ID, estado: 'pendiente_pago', stock_reservado: true, expira_en: iso(3_600_000), mp_init_point: null };
  configCuenta = [{ valor: '1' }];
  cuentaActiva = [{ id: 1 }];
  setupSql();
  crearPreferencia.mockResolvedValue({ preferenceId: 'pref-1', initPoint: 'https://mp/nuevo' });
});

afterEach(() => {
  process.env = { ...envOriginal };
  flagsTest()['pedido-pago-opcional'] = false;
});

test('flag off → 404 y UUID inválido → 400, ambos sin DB', async () => {
  flagsTest()['pedido-pago-opcional'] = false;
  expect((await POST(post(), ctx(ID))).status).toBe(404);
  expect(sql).not.toHaveBeenCalled();
  flagsTest()['pedido-pago-opcional'] = true;
  expect((await POST(post('no-es-uuid'), ctx('no-es-uuid'))).status).toBe(400);
  expect(sql).not.toHaveBeenCalled();
  expect(crearPreferencia).not.toHaveBeenCalled();
});

test('pedido inexistente → 404 sin preferencia', async () => {
  pedido = null;
  expect((await POST(post(), ctx(ID))).status).toBe(404);
  expect(crearPreferencia).not.toHaveBeenCalled();
});

test.each<[string, Partial<Pedido>]>([
  ['vencido', { expira_en: iso(-1_000) }],
  ['estado distinto de pendiente_pago', { estado: 'pagado' }],
  ['stock no reservado', { stock_reservado: false }],
])('%s → 409 sin preferencia', async (_caso, cambio) => {
  pedido = { ...pedido!, ...cambio };
  expect((await POST(post(), ctx(ID))).status).toBe(409);
  expect(crearPreferencia).not.toHaveBeenCalled();
});

test('preferencia vigente reusa link; sin link crea una y responde 200', async () => {
  pedido!.mp_init_point = 'https://mp/viejo';
  const reuso = await POST(post(), ctx(ID));
  expect(reuso.status).toBe(200);
  expect(await reuso.json()).toEqual({ init_point: 'https://mp/viejo' });
  expect(crearPreferencia).not.toHaveBeenCalled();
  pedido!.mp_init_point = null;
  const nuevo = await POST(post(), ctx(ID));
  expect(nuevo.status).toBe(200);
  expect(await nuevo.json()).toEqual({ init_point: 'https://mp/nuevo' });
  expect(crearPreferencia).toHaveBeenCalledWith(ID);
});

test('config MP ausente → 503 sin preferencia', async () => {
  delete process.env.MP_ACCESS_TOKEN;
  expect((await POST(post(), ctx(ID))).status).toBe(503);
  expect(crearPreferencia).not.toHaveBeenCalled();
});

test('reserva vence durante la llamada → 409 sin link', async () => {
  crearPreferencia.mockImplementationOnce(async () => {
    pedido!.expira_en = iso(-1_000);
    return { preferenceId: 'pref-1', initPoint: 'https://mp/nuevo' };
  });
  const res = await POST(post(), ctx(ID));
  expect(res.status).toBe(409);
  expect(JSON.stringify(await res.json())).not.toContain('https://mp/nuevo');
});

test('timeout → 502 genérico sin cancelar pedido ni liberar stock', async () => {
  crearPreferencia.mockRejectedValueOnce(new Error('MP timeout'));
  const res = await POST(post(), ctx(ID));
  expect(res.status).toBe(502);
  const json = JSON.stringify(await res.json());
  expect(json).not.toContain('MP timeout');
  const escrituras = sql.mock.calls.map((c) => (c[0] as string[]).join(''));
  expect(escrituras.some((q) => /UPDATE public\.pedidos|mp_preference_id\s*=/i.test(q))).toBe(false);
});
