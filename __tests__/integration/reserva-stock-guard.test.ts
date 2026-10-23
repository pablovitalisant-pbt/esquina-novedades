/**
 * @jest-environment node
 *
 * BUG-003 — Integración contra Postgres real (rama Neon test-integration).
 * El guard viejo `CASE ... ELSE 1 / 0` fallaba SIEMPRE porque Postgres pliega
 * la constante al planificar; los tests con sql mockeado no podían verlo.
 * Este test intenta romper la reserva en una base de verdad.
 */
import { sql } from '@/lib/db';
import { reservarStockLinea } from '@/lib/pedidos/reserva-stock';

const CODIGO = `IT-BUG003-${Date.now()}`;
let id: number;

beforeAll(async () => {
  const [p] = await sql`
    INSERT INTO productos (empresa_id, codigo, detalle, saldo, cantcaja, prcventa, activo)
    VALUES (NULL, ${CODIGO}, 'producto de test BUG-003', 10, 1, 1000, true)
    RETURNING id
  `;
  id = p.id;
});

afterAll(async () => {
  await sql`DELETE FROM productos WHERE codigo = ${CODIGO}`;
});

const saldo = async () => Number((await sql`SELECT saldo FROM productos WHERE id = ${id}`)[0].saldo);

test('con stock suficiente la reserva NO aborta y descuenta las unidades', async () => {
  await expect(sql.transaction([reservarStockLinea(id, 7)])).resolves.toBeDefined();
  expect(await saldo()).toBe(3);
});

test('sin stock suficiente aborta con 22012 y no descuenta nada', async () => {
  await expect(sql.transaction([reservarStockLinea(id, 4)])).rejects.toMatchObject({ code: '22012' });
  expect(await saldo()).toBe(3);
});

test('stock exacto se puede reservar completo (saldo llega a 0)', async () => {
  await expect(sql.transaction([reservarStockLinea(id, 3)])).resolves.toBeDefined();
  expect(await saldo()).toBe(0);
});