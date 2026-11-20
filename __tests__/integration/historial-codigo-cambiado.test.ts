/**
 * @jest-environment node
 *
 * B5 — Integración contra Postgres real (rama Neon test-integration).
 *
 * Las ventanas de códigos son lógica SQL: un mock no puede probar el borde
 * temporal, la reutilización de un código por otro producto ni la cadena
 * X→Y→X. Este test usa la tabla real creada por la migración 055.
 *
 * La migración la aplica el Director ANTES de esta suite. Si la tabla no
 * existe, el test falla con un mensaje explícito: no la crea desde aquí.
 */
import { NextRequest } from 'next/server';

const getServerSession = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
jest.mock('@/config/feature-flags.json', () =>
  require('@/__tests__/helpers/mockFlags').mockFlags({ 'producto-historial': true }));

import { GET } from '@/app/api/productos/[id]/historial/route';
import { sql } from '@/lib/db';

// La primera conexión a Neon TEST puede superar los 5 s por defecto.
jest.setTimeout(60000);

const PREFIJO = `B5-${Date.now()}`;
const X = `${PREFIJO}-X`; // código viejo de P, reutilizado por Q
const Y = `${PREFIJO}-Y`; // código actual de P
const Z = `${PREFIJO}-Z`; // código viejo de Q
const A = `${PREFIJO}-A`; // producto con cadena A→B→A
const B = `${PREFIJO}-B`;

const T0 = '2026-01-01T10:00:00Z';
const T1 = '2026-01-02T10:00:00Z';
const T1_MEDIO = '2026-01-02T15:00:00Z';
const T2 = '2026-01-03T10:00:00Z';
const T3 = '2026-01-04T10:00:00Z';
const T4 = '2026-01-05T10:00:00Z';

let empresaId: number;
let usuarioId: number;
let pId: number;
let qId: number;
let rId: number;

type Movimiento = {
  tipo: string;
  cantidad: number;
  efecto: number;
  detalle: string | null;
  codigo: string | null;
  estado: string | null;
};

type Respuesta = {
  producto: { codigo: string; codigos_anteriores: string[]; saldo: number };
  movimientos: Movimiento[];
  resumen: Record<string, number | boolean | null>;
};

const get = async (codigo: string): Promise<Respuesta> => {
  const res = await GET(
    new NextRequest(`http://localhost/api/productos/${encodeURIComponent(codigo)}/historial`),
    { params: Promise.resolve({ id: codigo }) },
  );
  expect(res.status).toBe(200);
  return (await res.json()) as Respuesta;
};

const producto = async (codigo: string, saldo: number) => {
  const [p] = await sql`
    INSERT INTO public.productos (empresa_id, codigo, detalle, saldo, cantcaja, prcventa, activo)
    VALUES (${empresaId}, ${codigo}, ${PREFIJO}, ${saldo}, 1, 1000, true)
    RETURNING id
  `;
  return p.id as number;
};

const cambio = (productoId: number, anterior: string, nuevo: string, fecha: string) =>
  sql`
    INSERT INTO public.productos_codigo_cambios
      (empresa_id, producto_id, codigo_anterior, codigo_nuevo, usuario_id, usuario_nombre, created_at)
    VALUES (${empresaId}, ${productoId}, ${anterior}, ${nuevo}, ${usuarioId}, 'IT B5', ${fecha}::timestamptz)
  `;

const ingreso = (codigo: string, cantidad: number, fecha: string, observaciones: string) =>
  sql`
    INSERT INTO public.ingresos_mercaderia
      (empresa_id, codigo, cantidad, cantcaja_registrado, observaciones, usuario_id, usuario_nombre, created_at)
    VALUES (${empresaId}, ${codigo}, ${cantidad}, 1, ${observaciones}, ${usuarioId}, 'IT B5', ${fecha}::timestamptz)
  `;

const conciliacion = (codigo: string, diferencia: number, fecha: string) =>
  sql`
    INSERT INTO public.conciliaciones_stock
      (empresa_id, codigo, saldo_anterior, saldo_nuevo, diferencia, cantcaja,
       fisico_cajas, fisico_unidades, usuario_id, usuario_nombre, created_at)
    VALUES (${empresaId}, ${codigo}, 100, ${100 + diferencia}, ${diferencia}, 1,
            0, 0, ${usuarioId}, 'IT B5', ${fecha}::timestamptz)
  `;

const nota = async (
  codigo: string,
  unidades: number,
  fecha: string,
  titulo: string,
  estado = 'activa',
) => {
  const [n] = await sql`
    INSERT INTO public.prenotas (titulo, titulo_base, usuario_id, estado, created_at, updated_at)
    VALUES (${titulo}, ${PREFIJO}, ${usuarioId}, ${estado}, ${fecha}::timestamptz, ${fecha}::timestamptz)
    RETURNING id
  `;
  await sql`
    INSERT INTO public.prenota_items
      (prenota_id, codigo, descripcion, empresa_id, cajas, unidades, precio)
    VALUES (${n.id}, ${codigo}, ${titulo}, ${empresaId}, 0, ${unidades}, 1000)
  `;
};

const pedido = async (
  productoId: number,
  codigo: string,
  unidades: number,
  fecha: string,
  stockReservado: boolean,
  estado: string,
) => {
  const [p] = await sql`
    INSERT INTO public.pedidos
      (nombre_contacto, telefono_contacto, origen, estado, stock_reservado, created_at)
    VALUES (${PREFIJO}, '1', 'productos', ${estado}, ${stockReservado}, ${fecha}::timestamptz)
    RETURNING id
  `;
  await sql`
    INSERT INTO public.pedido_items (pedido_id, producto_id, codigo, detalle, cantidad, unidades)
    VALUES (${p.id}::uuid, ${productoId}, ${codigo}, ${PREFIJO}, 1, ${unidades})
  `;
};

beforeAll(async () => {
  const [tabla] = await sql`SELECT to_regclass('public.productos_codigo_cambios') AS t`;
  if (!tabla?.t) {
    throw new Error(
      'Falta la migración 055 en la BD de TEST: public.productos_codigo_cambios no existe. ' +
      'El Director debe aplicarla en test-integration antes de correr esta suite.',
    );
  }

  const [empresa] = await sql`SELECT id FROM public.empresas ORDER BY id ASC LIMIT 1`;
  const [usuario] = await sql`SELECT id, nombre FROM public.usuarios ORDER BY id ASC LIMIT 1`;
  if (!empresa || !usuario) {
    throw new Error('La BD de TEST no tiene empresa/usuario base para el fixture de B5.');
  }
  empresaId = empresa.id;
  usuarioId = usuario.id;

  getServerSession.mockResolvedValue({
    user: { id: String(usuarioId), nombre: 'IT B5', rol: 'admin', empresas: [empresaId] },
  });

  // P: X → Y. Saldo esperado 35.
  pId = await producto(Y, 35);
  await cambio(pId, X, Y, T1);
  await ingreso(X, 40, T0, 'P-X-t0');
  await ingreso(Y, 1, T1, 'P-Y-t1-borde');
  await ingreso(X, 100, T1, 'P-X-t1-excluido');
  await ingreso(Y, 5, T2, 'P-Y-t2');
  await conciliacion(X, -6, T0);
  // Anulada: conserva el código viejo (la propagación solo toca activas) y
  // sirve de control de que el rescate no se aplica a notas anuladas.
  await nota(X, 5, T0, 'P-N1-vieja-anulada', 'anulada');
  await nota(Y, 2, T0, 'P-N2-rescatada');
  await nota(X, 7, T4, 'P-N3-de-Q');
  await pedido(pId, X, 3, T0, true, 'pendiente');
  await pedido(pId, Y, 1, T2, false, 'expirado');

  // Q: Z → X. Reutiliza X con movimientos posteriores a T3. Saldo esperado 9.
  qId = await producto(X, 9);
  await cambio(qId, Z, X, T3);
  await ingreso(X, 20, T4, 'Q-X-t4');
  await pedido(qId, X, 4, T4, true, 'pendiente');

  // R: A → B → A. Saldo esperado 60.
  rId = await producto(A, 60);
  await cambio(rId, A, B, T1);
  await cambio(rId, B, A, T2);
  await ingreso(A, 10, T0, 'R-A-t0');
  await ingreso(B, 20, T1_MEDIO, 'R-B-t1.5');
  await ingreso(A, 30, T3, 'R-A-t3');
});

afterAll(async () => {
  // Si beforeAll falló por la migración ausente, no hay nada que limpiar y el
  // DELETE de la tabla inexistente taparía el mensaje claro del beforeAll.
  const [tabla] = await sql`SELECT to_regclass('public.productos_codigo_cambios') AS t`;
  if (!tabla?.t) return;

  const ids = [pId, qId, rId].filter((n) => Number.isInteger(n));
  await sql`DELETE FROM public.productos_codigo_cambios WHERE producto_id = ANY(${ids})`;
  await sql`DELETE FROM public.pedido_items
            WHERE pedido_id IN (SELECT id FROM public.pedidos WHERE nombre_contacto = ${PREFIJO})`;
  await sql`DELETE FROM public.pedidos WHERE nombre_contacto = ${PREFIJO}`;
  await sql`DELETE FROM public.prenota_items
            WHERE prenota_id IN (SELECT id FROM public.prenotas WHERE titulo_base = ${PREFIJO})`;
  await sql`DELETE FROM public.prenotas WHERE titulo_base = ${PREFIJO}`;
  await sql`DELETE FROM public.ingresos_mercaderia WHERE codigo LIKE ${PREFIJO + '%'}`;
  await sql`DELETE FROM public.conciliaciones_stock WHERE codigo LIKE ${PREFIJO + '%'}`;
  await sql`DELETE FROM public.productos WHERE codigo LIKE ${PREFIJO + '%'}`;
});

describe('B5 — historial por cadena de códigos (DB real)', () => {
  test('P bajo su código nuevo incluye TODO lo anterior y no toca el X reutilizado', async () => {
    const body = await get(Y);

    expect(body.producto.codigo).toBe(Y);
    expect(body.producto.codigos_anteriores).toEqual([X]);

    const detalles = body.movimientos.map((m) => m.detalle);
    expect(detalles).toEqual(expect.arrayContaining([
      'P-X-t0', 'P-Y-t1-borde', 'P-Y-t2', 'P-N1-vieja-anulada', 'P-N2-rescatada',
    ]));
    expect(detalles).not.toContain('P-X-t1-excluido');
    expect(detalles).not.toContain('Q-X-t4');
    expect(detalles).not.toContain('P-N3-de-Q');

    expect(body.resumen).toMatchObject({
      ingresado: 46,
      ajustes: -6,
      vendido: 2,
      reservado: 3,
      saldo_actual: 35,
      diferencia: 0,
    });
  });

  test('Q no mezcla la historia de P al reutilizar el código X', async () => {
    const body = await get(X);
    expect(body.producto.codigos_anteriores).toEqual([Z]);
    const detalles = body.movimientos.map((m) => m.detalle);
    expect(detalles).toContain('Q-X-t4');
    expect(detalles).not.toContain('P-X-t0');
    expect(body.resumen).toMatchObject({
      ingresado: 20, vendido: 7, reservado: 4, saldo_actual: 9, diferencia: 0,
    });
  });

  test('cada movimiento conserva el código con que se registró', async () => {
    const body = await get(Y);
    const viejo = body.movimientos.find((m) => m.detalle === 'P-X-t0');
    expect(viejo?.codigo).toBe(X);
    const nuevo = body.movimientos.find((m) => m.detalle === 'P-Y-t2');
    expect(nuevo?.codigo).toBe(Y);
  });

  test('el borde es semiabierto: un movimiento exactamente en el cambio va al código nuevo', async () => {
    const body = await get(Y);
    const detalles = body.movimientos.map((m) => m.detalle);
    expect(detalles).toContain('P-Y-t1-borde');
    expect(detalles).not.toContain('P-X-t1-excluido');
  });

  test('cadena X→Y→X: las dos ventanas del mismo código suman, sin solaparse', async () => {
    const body = await get(A);
    expect(body.producto.codigos_anteriores).toEqual([B]);
    expect(body.resumen).toMatchObject({
      ingresado: 60, saldo_actual: 60, diferencia: 0,
    });
    const detalles = body.movimientos.map((m) => m.detalle);
    expect(detalles).toEqual(expect.arrayContaining(['R-A-t0', 'R-B-t1.5', 'R-A-t3']));
    expect(body.movimientos).toHaveLength(3);
  });
});
