/** @jest-environment node */

// N03b2 Fase B — POST /api/pedidos/[id]/metodo contra Postgres real (rama TEST).
// La elección es atómica: un ganador; cualquier rechazo deja metodo_pago intacto.
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';

jest.mock('@/config/feature-flags.json', () =>
  require('@/__tests__/helpers/mockFlags').mockFlags({ 'pedido-pago-opcional': true }));
import { POST } from '@/app/api/pedidos/[id]/metodo/route';

const env = { ...process.env };
const ids: string[] = [];
const PREFIJO = `N03b2-${Date.now()}`;

const crear = async (o: { entrega?: string; expira?: Date; mp?: string } = {}) => {
  const [p] = await sql`
    INSERT INTO pedidos (nombre_contacto, telefono_contacto, origen, estado,
      stock_reservado, expira_en, entrega_codigo, mp_init_point, total)
    VALUES (${PREFIJO}, '000', 'productos', 'pendiente_pago', true,
      ${(o.expira ?? new Date(Date.now() + 3_600_000)).toISOString()},
      ${o.entrega ?? 'delivery_iquique'}, ${o.mp ?? null}, 1000)
    RETURNING id`;
  ids.push(p.id);
  return p.id as string;
};

const post = (id: string, metodo: unknown) => POST(
  new NextRequest(`http://localhost/api/pedidos/${id}/metodo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ metodo }),
  }),
  { params: Promise.resolve({ id }) });

const metodoEnDb = async (id: string) =>
  (await sql`SELECT metodo_pago FROM pedidos WHERE id = ${id}`)[0].metodo_pago;

beforeAll(() => {
  Object.assign(process.env, {
    TRANSFERENCIA_BANCO: 'Banco Test', TRANSFERENCIA_TITULAR: 'Titular Test',
    TRANSFERENCIA_RUT: '11.111.111-1', TRANSFERENCIA_TIPO_CUENTA: 'Cuenta Vista',
    TRANSFERENCIA_NUMERO_CUENTA: '0000001',
  });
});

afterAll(async () => {
  for (const id of ids) await sql`DELETE FROM pedidos WHERE id = ${id}`;
  process.env = { ...env };
});

test('efectivo y transferencia concurrentes: exactamente un 200 y un 409', async () => {
  const id = await crear();
  const res = await Promise.all([post(id, 'efectivo'), post(id, 'transferencia')]);
  expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
  const body = await res.find((r) => r.status === 200)!.json();
  expect(body.referencia).toBe(id.slice(0, 8).toUpperCase());
  expect(body.metodo).toBe(await metodoEnDb(id));
});

test('efectivo en retiro → 409 sin mutar', async () => {
  const id = await crear({ entrega: 'retiro' });
  expect((await post(id, 'efectivo')).status).toBe(409);
  expect(await metodoEnDb(id)).toBeNull();
});

test('reserva vencida → 409 sin mutar', async () => {
  const id = await crear({ expira: new Date(Date.now() - 60_000) });
  expect((await post(id, 'transferencia')).status).toBe(409);
  expect(await metodoEnDb(id)).toBeNull();
});

test('preferencia MP histórica → 409 sin mutar', async () => {
  const id = await crear({ mp: 'https://mp/viejo' });
  expect((await post(id, 'transferencia')).status).toBe(409);
  expect(await metodoEnDb(id)).toBeNull();
});

test('configuración bancaria ausente → 503 sin mutar', async () => {
  const id = await crear();
  const guardado = process.env.TRANSFERENCIA_RUT;
  delete process.env.TRANSFERENCIA_RUT;
  try {
    expect((await post(id, 'transferencia')).status).toBe(503);
    expect(await metodoEnDb(id)).toBeNull();
  } finally {
    process.env.TRANSFERENCIA_RUT = guardado;
  }
});
