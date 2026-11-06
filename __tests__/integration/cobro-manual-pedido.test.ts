/** @jest-environment node */
/** N04c1 Fase B — cobro manual idempotente contra Postgres real (TEST):
 * un movimiento por pedido con actor, medio, total y vínculo a la nota. */
import { sql } from '@/lib/db';
import { registrarCobroManualPedido } from '@/lib/pedidos/cobro-pedido';

const PREFIJO = `N04C1-${Date.now()}`;
const TOTAL = 5000;
const pedidos: string[] = [];
let cuentaId = 0;
let actor = { id: 0, nombre: '' };

const crearPedido = async (metodo: 'efectivo' | 'transferencia', referencia: string | null) => {
  const [pre] = await sql`INSERT INTO prenotas (titulo, titulo_base, usuario_id)
    VALUES (${PREFIJO}, ${PREFIJO}, ${actor.id}) RETURNING id`;
  await sql`INSERT INTO prenota_items (prenota_id, codigo, unidades, precio)
    VALUES (${pre.id}, ${PREFIJO}, 1, ${TOTAL})`;
  const [p] = await sql`INSERT INTO pedidos
    (nombre_contacto, telefono_contacto, origen, estado, prenota_id, total, metodo_pago)
    VALUES (${PREFIJO}, '000', 'productos', 'convertido', ${pre.id}, ${TOTAL}, ${metodo}) RETURNING id`;
  await sql`INSERT INTO pedido_pagos_manuales
    (pedido_id, cuenta_id, usuario_id, metodo, monto, referencia)
    VALUES (${p.id}, ${cuentaId}, ${actor.id}, ${metodo}, ${TOTAL}, ${referencia})`;
  pedidos.push(p.id);
  return p.id as string;
};

const movimientosDe = (pedidoId: string) => sql`SELECT m.id, m.fecha, m.monto, m.forma_pago,
  m.usuario_id, m.usuario_nombre, m.observaciones FROM caja_movimientos m
  JOIN pedidos p ON p.caja_movimiento_id = m.id WHERE p.id = ${pedidoId}`;

beforeAll(async () => {
  const [cuenta] = await sql`INSERT INTO caja_cuentas (nombre, moneda)
    VALUES (${PREFIJO}, 'CLP') RETURNING id`;
  cuentaId = cuenta.id;
  const [a] = await sql`INSERT INTO usuarios (rut, nombre, rol, password, activo)
    VALUES (${PREFIJO}, 'Operador N04c1', 'admin', 'x', false) RETURNING id, nombre`;
  actor = { id: Number(a.id), nombre: String(a.nombre) };
});

afterAll(async () => {
  await sql`DELETE FROM caja_movimiento_notas
    WHERE prenota_id IN (SELECT id FROM prenotas WHERE usuario_id = ${actor.id})`;
  await sql`DELETE FROM caja_movimientos WHERE cuenta_id = ${cuentaId}`;
  await sql`DELETE FROM pedido_pagos_manuales WHERE cuenta_id = ${cuentaId}`;
  for (const id of pedidos) await sql`DELETE FROM pedidos WHERE id = ${id}`;
  await sql`DELETE FROM prenotas WHERE usuario_id = ${actor.id}`;
  if (cuentaId) await sql`DELETE FROM caja_cuentas WHERE id = ${cuentaId}`;
  if (actor.id) await sql`DELETE FROM usuarios WHERE id = ${actor.id}`;
});

test('cobro concurrente: un registrado, un ya y movimiento único vinculado', async () => {
  const id = await crearPedido('transferencia', 'TRF-N04C1');
  const [pedido] = await sql`SELECT prenota_id FROM pedidos WHERE id = ${id}`;
  const resultados = await Promise.all([registrarCobroManualPedido(id), registrarCobroManualPedido(id)]);
  expect(resultados.sort()).toEqual(['registrado', 'ya']);

  const movs = await movimientosDe(id);
  expect(movs).toHaveLength(1);
  expect(movs[0]).toMatchObject({
    forma_pago: 'transferencia', usuario_id: actor.id, usuario_nombre: actor.nombre,
  });
  expect(Number(movs[0].monto)).toBe(TOTAL);
  expect(movs[0].observaciones).toContain('TRF-N04C1');
  const notas = await sql`SELECT prenota_id, monto_aplicado FROM caja_movimiento_notas WHERE movimiento_id = ${movs[0].id}`;
  expect(notas).toHaveLength(1);
  expect(notas[0].prenota_id).toBe(pedido.prenota_id);
  expect(Number(notas[0].monto_aplicado)).toBe(TOTAL);
});

test('efectivo sin referencia registra el medio y un movimiento', async () => {
  const id = await crearPedido('efectivo', null);
  expect(await registrarCobroManualPedido(id)).toBe('registrado');
  const movs = await movimientosDe(id);
  expect(movs).toHaveLength(1);
  expect(movs[0]).toMatchObject({
    forma_pago: 'efectivo', usuario_id: actor.id, usuario_nombre: actor.nombre,
  });
  expect(Number(movs[0].monto)).toBe(TOTAL);
});

test('sin confirmación persistida no cobra ni deja movimiento', async () => {
  const [pre] = await sql`INSERT INTO prenotas (titulo, titulo_base, usuario_id)
    VALUES (${PREFIJO}, ${PREFIJO}, ${actor.id}) RETURNING id`;
  const [p] = await sql`INSERT INTO pedidos
    (nombre_contacto, telefono_contacto, origen, estado, prenota_id, total)
    VALUES (${PREFIJO}, '000', 'productos', 'convertido', ${pre.id}, ${TOTAL}) RETURNING id`;
  pedidos.push(p.id);
  expect(await registrarCobroManualPedido(p.id)).toBe('sin_confirmacion');
  expect(await movimientosDe(p.id)).toHaveLength(0);
  const [fila] = await sql`SELECT caja_movimiento_id FROM pedidos WHERE id = ${p.id}`;
  expect(fila.caja_movimiento_id).toBeNull();
});
