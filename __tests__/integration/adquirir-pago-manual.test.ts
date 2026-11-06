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

const crearPedido = async (o: { total?: number; expira?: Date } = {}) => {
  const [p] = await sql`
    INSERT INTO pedidos (nombre_contacto, telefono_contacto, origen, estado,
      stock_reservado, expira_en, metodo_pago, total)
    VALUES (${PREFIJO}, '000', 'productos', 'pendiente_pago', true,
      ${(o.expira ?? new Date(Date.now() + 3_600_000)).toISOString()},
      'transferencia', ${o.total ?? 1000})
    RETURNING id`;
  ids.push(p.id);
  return p.id as string;
};

const adquirir = (pedidoId: string, monto = 1000, referencia = 'TRF-N04B1') =>
  adquirirPagoManual({ pedidoId, cuentaId, usuarioId, monto, referencia });

const estadoEnDb = async (id: string) =>
  (await sql`SELECT estado, stock_reservado FROM pedidos WHERE id = ${id}`)[0];

const pagosDe = async (id: string) =>
  (await sql`SELECT monto, referencia FROM pedido_pagos_manuales WHERE pedido_id = ${id}`);

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
  expect((await estadoEnDb(id)).estado).toBe('pendiente_pago');
});

test('referencia duplicada en la cuenta retorna conflicto y revierte el pedido', async () => {
  const primero = await crearPedido();
  const segundo = await crearPedido();

  expect(await adquirir(primero, 1000, 'TRF-REPETIDA')).toBe('adquirido');
  expect(await adquirir(segundo, 1000, 'TRF-REPETIDA')).toBe('conflicto');
  expect(await pagosDe(segundo)).toHaveLength(0);
  expect((await estadoEnDb(segundo)).estado).toBe('pendiente_pago');
});
