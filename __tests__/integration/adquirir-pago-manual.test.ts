/** @jest-environment node */
/**
 * N04b1 Fase B — adquirirPagoManual contra Postgres real (rama TEST).
 * La adquisición es atómica: un solo ganador, sin tocar stock, y rollback
 * cuando el registro de confirmación viola la referencia única.
 */
import { sql } from '@/lib/db';
import { adquirirPagoManual } from '@/lib/pedidos/adquirir-pago-manual';

const PREFIJO = `N04B1-${Date.now()}`;
const ids: string[] = [];
let cuentaId: number;
let usuarioId: number;

const crearPedido = async (
  o: {
    total?: number;
    expira?: Date;
    metodoPago?: string | null;
    mpInitPoint?: string;
    mpPaymentId?: string;
  } = {},
) => {
  const [p] = await sql`
    INSERT INTO pedidos (nombre_contacto, telefono_contacto, origen, estado,
      stock_reservado, expira_en, metodo_pago, total, mp_init_point, mp_payment_id)
    VALUES (${PREFIJO}, '000', 'productos', 'pendiente_pago', true,
      ${(o.expira ?? new Date(Date.now() + 3_600_000)).toISOString()},
      ${o.metodoPago === undefined ? 'transferencia' : o.metodoPago}, ${o.total ?? 1000},
      ${o.mpInitPoint ?? null}, ${o.mpPaymentId ?? null})
    RETURNING id`;
  ids.push(p.id);
  return p.id as string;
};

const adquirir = (pedidoId: string, monto = 1000, referencia = 'TRF-N04B1') =>
  adquirirPagoManual({ pedidoId, cuentaId, usuarioId, monto, referencia });

// M1: el admin puede elegir el método cuando el pedido no lo trae.
const adquirirCon = (
  pedidoId: string,
  o: { metodo?: 'efectivo' | 'transferencia'; referencia?: string; monto?: number } = {},
) => adquirirPagoManual({
  pedidoId, cuentaId, usuarioId, monto: o.monto ?? 1000, referencia: o.referencia, metodo: o.metodo,
});

const estadoEnDb = async (id: string) =>
  (await sql`SELECT estado, stock_reservado, metodo_pago FROM pedidos WHERE id = ${id}`)[0];

const pagosDe = async (id: string) =>
  (await sql`SELECT monto, referencia, metodo FROM pedido_pagos_manuales WHERE pedido_id = ${id}`);

beforeAll(async () => {
  const [cuenta] = await sql`
    INSERT INTO caja_cuentas (nombre, moneda) VALUES (${`Caja ${PREFIJO}`}, 'CLP')
    RETURNING id`;
  cuentaId = cuenta.id;

  const [usuario] = await sql`
    INSERT INTO usuarios (rut, nombre, rol, password, activo)
    VALUES (${PREFIJO}, 'Fixture N04b1', 'admin', 'x', false) RETURNING id`;
  usuarioId = usuario.id;
});

afterAll(async () => {
  for (const id of ids) {
    await sql`DELETE FROM pedido_pagos_manuales WHERE pedido_id = ${id}`;
    await sql`DELETE FROM pedidos WHERE id = ${id}`;
  }
  if (cuentaId) await sql`DELETE FROM caja_cuentas WHERE id = ${cuentaId}`;
  if (usuarioId) await sql`DELETE FROM usuarios WHERE id = ${usuarioId}`;
});

test('dos solicitudes concurrentes: un adquirido, un reintento y un solo registro', async () => {
  const id = await crearPedido();
  const resultados = await Promise.all([adquirir(id), adquirir(id)]);

  expect(resultados.sort()).toEqual(['adquirido', 'reintento']);
  expect(await pagosDe(id)).toHaveLength(1);
  expect(await estadoEnDb(id)).toMatchObject({ estado: 'pagado', stock_reservado: true });
});

test('monto distinto del total no adquiere ni registra', async () => {
  const id = await crearPedido({ total: 1000 });

  expect(await adquirir(id, 999)).toBe('conflicto');
  expect(await pagosDe(id)).toHaveLength(0);
  expect((await estadoEnDb(id)).estado).toBe('pendiente_pago');
});

test('reserva vencida no adquiere ni registra', async () => {
  const id = await crearPedido({ expira: new Date(Date.now() - 60_000) });

  expect(await adquirir(id)).toBe('conflicto');
  expect(await pagosDe(id)).toHaveLength(0);

  // Este pedido ya está vencido, así que otra suite llamando
  // liberarReservasVencidas() contra la misma BD de TEST puede marcarlo
  // 'expirado' antes de que leamos. Ambos estados son válidos: lo que este
  // test garantiza es que adquirir NO adquirió (nunca 'pagado') y que no
  // tocó stock_reservado: queda como lo dejó la creación (pendiente_pago →
  // true) o la liberación (expirado → false).
  const { estado, stock_reservado } = await estadoEnDb(id);
  expect(['pendiente_pago', 'expirado']).toContain(estado);
  expect(stock_reservado).toBe(estado === 'pendiente_pago');
});

test('referencia duplicada en la cuenta retorna conflicto y revierte el pedido', async () => {
  const primero = await crearPedido();
  const segundo = await crearPedido();

  expect(await adquirir(primero, 1000, 'TRF-REPETIDA')).toBe('adquirido');
  expect(await adquirir(segundo, 1000, 'TRF-REPETIDA')).toBe('conflicto');
  expect(await pagosDe(segundo)).toHaveLength(0);
  expect((await estadoEnDb(segundo)).estado).toBe('pendiente_pago');
});

// --- M1: pedido sin método (comprador nunca eligió) + método elegido por el admin

test('pedido sin método: sin elegir método no adquiere (undefined no rompe el driver)', async () => {
  const id = await crearPedido({ metodoPago: null });

  expect(await adquirirCon(id)).toBe('conflicto');
  expect(await pagosDe(id)).toHaveLength(0);
  expect((await estadoEnDb(id)).metodo_pago).toBeNull();
});

test('pedido sin método: el método elegido se registra en el pedido y en el pago', async () => {
  const id = await crearPedido({ metodoPago: null });

  expect(await adquirirCon(id, { metodo: 'transferencia', referencia: 'TRF-NULL-1' })).toBe('adquirido');
  const { estado, metodo_pago } = await estadoEnDb(id);
  expect(estado).toBe('pagado');
  expect(metodo_pago).toBe('transferencia');
  expect(await pagosDe(id)).toEqual([
    expect.objectContaining({ metodo: 'transferencia', referencia: 'TRF-NULL-1' }),
  ]);
});

test('pedido sin método con efectivo: exige referencia nula y la registra sin referencia', async () => {
  const conRef = await crearPedido({ metodoPago: null });
  expect(await adquirirCon(conRef, { metodo: 'efectivo', referencia: 'NO' })).toBe('conflicto');
  expect(await pagosDe(conRef)).toHaveLength(0);

  const sinRef = await crearPedido({ metodoPago: null });
  expect(await adquirirCon(sinRef, { metodo: 'efectivo' })).toBe('adquirido');
  expect(await pagosDe(sinRef)).toEqual([
    expect.objectContaining({ metodo: 'efectivo', referencia: null }),
  ]);
});

test('método distinto al ya fijado en el pedido no adquiere', async () => {
  const id = await crearPedido({ metodoPago: 'transferencia' });

  expect(await adquirirCon(id, { metodo: 'efectivo' })).toBe('conflicto');
  expect(await pagosDe(id)).toHaveLength(0);
  expect((await estadoEnDb(id)).estado).toBe('pendiente_pago');
});

// M1 (riesgo 2, decisión 6): un pedido legado sin método pero con rastro de
// Mercado Pago no se puede marcar pagado: el dinero pudo entrar por MP.
test('pedido sin método con mp_init_point no adquiere ni registra', async () => {
  const id = await crearPedido({
    metodoPago: null, mpInitPoint: 'https://www.mercadopago.com/checkout/pref-1',
  });

  expect(await adquirirCon(id, { metodo: 'transferencia', referencia: 'TRF-MP-1' })).toBe('conflicto');
  expect(await pagosDe(id)).toHaveLength(0);
  expect(await estadoEnDb(id)).toMatchObject({ estado: 'pendiente_pago', metodo_pago: null });
});

test('pedido sin método con mp_payment_id no adquiere ni registra', async () => {
  const id = await crearPedido({ metodoPago: null, mpPaymentId: '999' });

  expect(await adquirirCon(id, { metodo: 'transferencia', referencia: 'TRF-MP-2' })).toBe('conflicto');
  expect(await pagosDe(id)).toHaveLength(0);
  expect(await estadoEnDb(id)).toMatchObject({ estado: 'pendiente_pago', metodo_pago: null });
});

test('reintento idéntico con método → reintento; con otro método → conflicto', async () => {
  const id = await crearPedido({ metodoPago: null });

  expect(await adquirirCon(id, { metodo: 'transferencia', referencia: 'TRF-RETRY-1' })).toBe('adquirido');
  expect(await adquirirCon(id, { metodo: 'transferencia', referencia: 'TRF-RETRY-1' })).toBe('reintento');
  expect(await adquirirCon(id, { metodo: 'efectivo' })).toBe('conflicto');
  expect(await adquirir(id, 1000, 'TRF-RETRY-1')).toBe('reintento'); // sin método: usa el del pedido
  expect(await pagosDe(id)).toHaveLength(1);
});
