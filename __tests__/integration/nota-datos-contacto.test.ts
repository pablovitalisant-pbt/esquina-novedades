/** @jest-environment node */

/**
 * N07a Fase B — GET /api/notas-venta/[id] contra Postgres TEST real.
 * Prioridad: pedido vinculado más reciente; lo que falte se completa desde
 * la ficha; si no hay nada, null. Cada nota sigue siendo una fila.
 */
import { NextRequest } from 'next/server';

const getServerSession = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: (...a: any[]) => getServerSession(...a),
}));

import { GET } from '@/app/api/notas-venta/[id]/route';
import { sql } from '@/lib/db';

const PREFIJO = `N07A-${Date.now()}`;
const TEL_FICHA_1 = `9${Date.now()}1`;
const TEL_FICHA_2 = `9${Date.now()}2`;
let usuarioId: number;

const cliente = async (direccion: string | null, telefono: string | null) => {
  const [c] = await sql`INSERT INTO clientes (nombre, direccion, telefono)
    VALUES (${PREFIJO}, ${direccion}, ${telefono}) RETURNING id`;
  return c.id as string;
};

const nota = async (clienteId: string) => {
  const [p] = await sql`INSERT INTO prenotas (titulo, titulo_base, usuario_id, cliente_id)
    VALUES (${PREFIJO}, ${PREFIJO}, ${usuarioId}, ${clienteId}) RETURNING id`;
  return p.id as number;
};

const pedido = async (clienteId: string, notaId: number,
  o: { direccion?: string | null; telefono?: string; edadMin?: number }) => {
  await sql`INSERT INTO pedidos (cliente_id, nombre_contacto, telefono_contacto,
      origen, prenota_id, direccion_entrega, created_at)
    VALUES (${clienteId}, ${PREFIJO}, ${o.telefono ?? ''}, 'productos', ${notaId},
      ${o.direccion ?? null}, now() - (${o.edadMin ?? 0} * interval '1 minute'))`;
};

const get = async (id: number) =>
  GET(new NextRequest(`http://localhost/api/notas-venta/${id}`),
    { params: Promise.resolve({ id: String(id) }) });

beforeAll(async () => {
  const [u] = await sql`INSERT INTO usuarios (rut, nombre, rol, password)
    VALUES (${PREFIJO}, 'Test N07a', 'admin', 'x') RETURNING id`;
  usuarioId = u.id;
});

beforeEach(() => {
  getServerSession.mockResolvedValue({ user: { id: String(usuarioId), rol: 'admin' } });
});

afterAll(async () => {
  await sql`DELETE FROM pedidos WHERE nombre_contacto = ${PREFIJO}`;
  await sql`DELETE FROM prenotas WHERE titulo = ${PREFIJO}`;
  await sql`DELETE FROM clientes WHERE nombre = ${PREFIJO}`;
  await sql`DELETE FROM usuarios WHERE rut = ${PREFIJO}`;
});

test('sin sesión → 401', async () => {
  getServerSession.mockResolvedValueOnce(null);
  expect((await get(1)).status).toBe(401);
});

test('prefiere el pedido más reciente y no duplica la nota', async () => {
  const c = await cliente('Ficha 123', TEL_FICHA_1);
  const n = await nota(c);
  await pedido(c, n, { direccion: 'Entrega vieja', telefono: '900000001', edadMin: 60 });
  await pedido(c, n, { direccion: 'Entrega 456', telefono: '988887777' });
  const body = await (await get(n)).json();
  expect(body.id).toBe(n);
  expect(body.cliente_direccion).toBe('Entrega 456');
  expect(body.cliente_telefono).toBe('988887777');
});

test('completa desde la ficha lo que el pedido trae vacío', async () => {
  const c = await cliente('Ficha 789', TEL_FICHA_2);
  const n = await nota(c);
  await pedido(c, n, { direccion: '   ', telefono: '   ' });
  const body = await (await get(n)).json();
  expect(body.cliente_direccion).toBe('Ficha 789');
  expect(body.cliente_telefono).toBe(TEL_FICHA_2);
});

test('sin pedido ni datos en la ficha devuelve ambos null', async () => {
  const c = await cliente(null, null);
  const n = await nota(c);
  await pedido(c, n, { direccion: '', telefono: '' });
  const body = await (await get(n)).json();
  expect(body.cliente_direccion).toBeNull();
  expect(body.cliente_telefono).toBeNull();
});
