/** @jest-environment node */
/**
 * N04b2 Fase B — protección de pedidos con pago manual contra Postgres real (TEST).
 * PATCH no descarta un pagado por efectivo/transferencia; el webhook de MP no
 * escribe ni procesa esos pedidos: no toca mp_payment_id/estado ni colaboradores.
 * Fixtures sin ítems: ninguna ruta de stock entra en juego.
 */
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';

const getServerSession = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: (...a: any[]) => getServerSession(...a),
}));
jest.mock('@/lib/pedidos/convertir', () => ({ convertirPedido: jest.fn() }));
jest.mock('@/lib/pedidos/cobro-pedido', () => ({ registrarCobroPedido: jest.fn() }));
jest.mock('@/lib/pedidos/usuario-sistema', () => ({ usuarioSistema: jest.fn() }));

import { PATCH } from '@/app/api/pedidos/[id]/route';
import { pagoAprobado } from '@/lib/pedidos/pago-aprobado';
import { convertirPedido } from '@/lib/pedidos/convertir';
import { registrarCobroPedido } from '@/lib/pedidos/cobro-pedido';
import { usuarioSistema } from '@/lib/pedidos/usuario-sistema';

const PREFIJO = `N04B2-${Date.now()}`;
const ids: string[] = [];

const crear = async (o: { estado?: string; metodo: string }) => {
  const [p] = await sql`
    INSERT INTO pedidos (nombre_contacto, telefono_contacto, origen, estado,
      stock_reservado, metodo_pago, total)
    VALUES (${PREFIJO}, '000', 'productos', ${o.estado ?? 'pendiente_pago'}, true,
      ${o.metodo}, 1000)
    RETURNING id`;
  ids.push(p.id);
  return p.id as string;
};

const fila = async (id: string) =>
  (await sql`SELECT estado, metodo_pago, mp_payment_id FROM pedidos WHERE id = ${id}`)[0];

const patch = (id: string) => PATCH(
  new NextRequest(`http://localhost/api/pedidos/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ estado: 'descartado' }),
  }),
  { params: Promise.resolve({ id }) });

beforeEach(() => {
  getServerSession.mockResolvedValue({ user: { id: '1', rol: 'admin' } });
  (convertirPedido as jest.Mock).mockResolvedValue({ status: 201, body: {} });
  (registrarCobroPedido as jest.Mock).mockResolvedValue('registrado');
  (usuarioSistema as jest.Mock).mockResolvedValue({ id: 1, nombre: 'Sistema' });
});

afterAll(async () => {
  for (const id of ids) await sql`DELETE FROM pedidos WHERE id = ${id}`;
});

test('PATCH descarta un pendiente_pago sin confirmación', async () => {
  const id = await crear({ metodo: 'transferencia' });
  expect((await patch(id)).status).toBe(200);
  expect((await fila(id)).estado).toBe('descartado');
});

test.each(['efectivo', 'transferencia'])(
  'PATCH rechaza descartar un pagado por %s sin mutar', async (metodo) => {
    const id = await crear({ estado: 'pagado', metodo });
    expect((await patch(id)).status).toBe(409);
    expect(await fila(id)).toMatchObject({ estado: 'pagado', metodo_pago: metodo, mp_payment_id: null });
  });

test.each(['efectivo', 'transferencia'])(
  'pagoAprobado no toca un pedido por %s ni llama colaboradores', async (metodo) => {
    const id = await crear({ metodo });
    (convertirPedido as jest.Mock).mockClear();
    (registrarCobroPedido as jest.Mock).mockClear();
    (usuarioSistema as jest.Mock).mockClear();

    await pagoAprobado(id, { id: 999, transaction_amount: 1000, currency_id: 'CLP' });

    expect(await fila(id)).toMatchObject({ estado: 'pendiente_pago', mp_payment_id: null });
    expect(convertirPedido).not.toHaveBeenCalled();
    expect(registrarCobroPedido).not.toHaveBeenCalled();
    expect(usuarioSistema).not.toHaveBeenCalled();
  });
