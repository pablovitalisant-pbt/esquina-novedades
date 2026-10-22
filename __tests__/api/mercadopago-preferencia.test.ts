/** @jest-environment node */
import { mpConfig, siteUrl, elegirInitPoint } from '@/lib/mercadopago/config';
import {
  construirItemsPreferencia, construirPreferencia,
  type LineaPreferencia, type PedidoPreferencia,
} from '@/lib/pedidos/preferencia';

const PEDIDO: PedidoPreferencia = {
  id: '11111111-1111-4111-8111-111111111111',
  email_contacto: 'juana@example.com',
  entrega_codigo: 'domicilio',
  entrega_costo: 3000,
  entrega_nombre: 'Despacho a domicilio',
  expira_en: '2026-10-24T12:00:00.000Z',
};
const LINEAS: LineaPreferencia[] = [
  { producto_id: 118, codigo: '1055', detalle: 'Gallinita', cantidad: 2, precio: 12000 },
  { producto_id: 119, codigo: '2001', detalle: null, cantidad: 1, precio: '1500' as any },
];
const SITE = 'https://tienda.example.com';
let envOriginal: NodeJS.ProcessEnv;

beforeEach(() => { envOriginal = { ...process.env }; });
afterEach(() => { process.env = envOriginal; });

describe('config MP', () => {
  test('sin token falla claro; con token lo usa', () => {
    delete process.env.MP_ACCESS_TOKEN;
    expect(() => mpConfig()).toThrow(/MP_ACCESS_TOKEN/);
    process.env.MP_ACCESS_TOKEN = 'TEST-123';
    expect((mpConfig() as any).accessToken).toBe('TEST-123');
  });

  test('siteUrl recorta barra final; ausente o inválida falla', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://tienda.example.com/';
    expect(siteUrl()).toBe(SITE);
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(() => siteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/);
    process.env.NEXT_PUBLIC_SITE_URL = 'no-es-url';
    expect(() => siteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  test('TEST- usa sandbox; real usa init_point; falta el elegido → error', () => {
    const pref = { init_point: 'https://mp/init', sandbox_init_point: 'https://mp/sandbox' };
    expect(elegirInitPoint(pref, 'TEST-abc')).toBe('https://mp/sandbox');
    expect(elegirInitPoint(pref, 'APP_USR-abc')).toBe('https://mp/init');
    expect(() => elegirInitPoint({ init_point: 'x' }, 'TEST-abc')).toThrow(/init_point/);
    expect(() => elegirInitPoint({ sandbox_init_point: 'x' }, 'APP_USR-abc')).toThrow(/init_point/);
  });
});

describe('builder puro de preferencia', () => {
  test('items: precio entero CLP; quantity de la modalidad (caja = cantidad, no unidades)', () => {
    const items = construirItemsPreferencia(LINEAS, 0);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      id: '118', title: 'Gallinita', quantity: 2, unit_price: 12000, currency_id: 'CLP',
    });
    expect(Number.isInteger(items[1].unit_price)).toBe(true);
    expect(items[1]).toMatchObject({ unit_price: 1500, title: '2001' });
  });

  test('despacho: costo 0 no genera ítem; costo > 0 usa nombre de DB o código', () => {
    expect(construirItemsPreferencia(LINEAS, 0)).toHaveLength(2);
    const conDespacho = construirItemsPreferencia(LINEAS, 3000, 'Despacho a domicilio');
    expect(conDespacho).toHaveLength(3);
    expect(conDespacho[2]).toEqual({
      id: 'despacho', title: 'Despacho: Despacho a domicilio',
      quantity: 1, unit_price: 3000, currency_id: 'CLP',
    });
    expect(construirItemsPreferencia(LINEAS, 2500, null, 'domicilio')[2].title)
      .toBe('Despacho: domicilio');
  });

  test('body: reference, payer, notification, back_urls, auto_return y expiración desde DB', () => {
    const ahora = new Date('2026-10-22T12:00:00.000Z');
    const body: any = construirPreferencia(PEDIDO, LINEAS, SITE, ahora);
    expect(body.external_reference).toBe(PEDIDO.id);
    expect(body.payer.email).toBe('juana@example.com');
    expect(body.notification_url).toBe(`${SITE}/api/mercadopago/webhook`);
    expect(body.back_urls).toEqual({
      success: `${SITE}/pedido/${PEDIDO.id}`,
      failure: `${SITE}/pedido/${PEDIDO.id}`,
      pending: `${SITE}/pedido/${PEDIDO.id}`,
    });
    expect(body).toMatchObject({ auto_return: 'approved', expires: true });
    expect(body.expiration_date_from).toBe(ahora.toISOString());
    // Viene de pedidos.expira_en; NO es ahora + 36 h.
    expect(body.expiration_date_to).toBe('2026-10-24T12:00:00.000Z');
    expect(body.items).toHaveLength(3);
  });
});
