/**
 * @jest-environment node
 *
 * N03a — esquema real de pedidos.metodo_pago (Neon test-integration).
 * El safeguard anti-producción de jest.env-setup corre antes de lib/db.
 */
import { sql } from '@/lib/db';

const CODIGO = `IT-N03A-${Date.now()}`;
let id: string;
let isNullable: string | undefined;

beforeAll(async () => {
  const cols = await sql`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'metodo_pago'
  `;
  if (!cols.length) throw new Error('N03a: falta pedidos.metodo_pago; aplica migrations/049');
  isNullable = cols[0].is_nullable;

  const [p] = await sql`
    INSERT INTO pedidos (nombre_contacto, telefono_contacto, origen, estado)
    VALUES (${`Fixture ${CODIGO}`}, ${CODIGO}, 'productos', 'pendiente')
    RETURNING id
  `;
  id = p.id;
});

afterAll(async () => {
  if (id) await sql`DELETE FROM pedidos WHERE id = ${id}`;
});

test('information_schema: metodo_pago existe y es nullable', () => {
  expect(isNullable).toBe('YES');
});

test('pedido nuevo conserva metodo_pago null', async () => {
  const [row] = await sql`SELECT metodo_pago, estado, stock_reservado FROM pedidos WHERE id = ${id}`;
  expect(row).toEqual({ metodo_pago: null, estado: 'pendiente', stock_reservado: false });
});

test.each(['mercadopago', 'transferencia', 'efectivo'])(
  'roundtrip %s sin cambiar estado ni stock',
  async (metodo) => {
    const [row] = await sql`
      UPDATE pedidos SET metodo_pago = ${metodo} WHERE id = ${id}
      RETURNING metodo_pago, estado, stock_reservado
    `;
    expect(row).toEqual({ metodo_pago: metodo, estado: 'pendiente', stock_reservado: false });
  }
);

test('valor inválido falla con 23514 y no cambia estado ni stock', async () => {
  await expect(sql`UPDATE pedidos SET metodo_pago = 'tarjeta' WHERE id = ${id}`)
    .rejects.toMatchObject({ code: '23514' });
  const [row] = await sql`SELECT estado, stock_reservado FROM pedidos WHERE id = ${id}`;
  expect(row).toEqual({ estado: 'pendiente', stock_reservado: false });
});
