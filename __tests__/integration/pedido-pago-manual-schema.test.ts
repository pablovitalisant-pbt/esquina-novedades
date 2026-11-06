/** @jest-environment node */
/**
 * N04a — esquema real de pedido_pagos_manuales (Neon test-integration).
 * No aplica migraciones: en rojo si falta la tabla.
 */
import { sql } from '@/lib/db';

const CODIGO = `IT-N04A-${Date.now()}`;
let tablaExiste = false;
let pedidoId: string;
let otroPedidoId: string;
let cuentaId: number;
let usuarioId: number;

const insertar = (
  pedido: string,
  referencia: string | null,
  monto = 1000,
  metodo = 'transferencia'
) => sql`
  INSERT INTO public.pedido_pagos_manuales
    (pedido_id, cuenta_id, usuario_id, metodo, monto, referencia)
  VALUES (${pedido}, ${cuentaId}, ${usuarioId}, ${metodo}, ${monto}, ${referencia})
`;

beforeAll(async () => {
  const [tabla] = await sql`SELECT to_regclass('public.pedido_pagos_manuales') AS t`;
  tablaExiste = Boolean(tabla.t);
  if (!tablaExiste) throw new Error('N04a: falta pedido_pagos_manuales; aplica migrations/050');

  const [cuenta] = await sql`
    INSERT INTO public.caja_cuentas (nombre, moneda) VALUES (${`Caja ${CODIGO}`}, 'CLP') RETURNING id
  `;
  cuentaId = cuenta.id;

  const [usuario] = await sql`
    INSERT INTO public.usuarios (rut, nombre, rol, password, activo)
    VALUES (${CODIGO}, 'Fixture N04a', 'admin', 'x', false) RETURNING id
  `;
  usuarioId = usuario.id;

  const pedidos = await sql`
    INSERT INTO public.pedidos (nombre_contacto, telefono_contacto, origen)
    VALUES (${'Fixture N04a'}, ${CODIGO}, 'productos'),
           (${'Fixture N04a bis'}, ${CODIGO}, 'productos') RETURNING id
  `;
  pedidoId = pedidos[0].id;
  otroPedidoId = pedidos[1].id;
});

afterAll(async () => {
  if (tablaExiste) {
    if (pedidoId) await sql`DELETE FROM public.pedido_pagos_manuales WHERE pedido_id = ${pedidoId}`;
    if (otroPedidoId) await sql`DELETE FROM public.pedido_pagos_manuales WHERE pedido_id = ${otroPedidoId}`;
  }
  if (pedidoId) await sql`DELETE FROM public.pedidos WHERE id = ${pedidoId}`;
  if (otroPedidoId) await sql`DELETE FROM public.pedidos WHERE id = ${otroPedidoId}`;
  if (cuentaId) await sql`DELETE FROM public.caja_cuentas WHERE id = ${cuentaId}`;
  if (usuarioId) await sql`DELETE FROM public.usuarios WHERE id = ${usuarioId}`;
});

test('inserción y lectura de una transferencia', async () => {
  await insertar(pedidoId, 'TRF-A');
  const [row] = await sql`
    SELECT pedido_id, cuenta_id, usuario_id, metodo, monto, referencia, confirmado_en
    FROM public.pedido_pagos_manuales WHERE pedido_id = ${pedidoId}
  `;
  expect(row).toMatchObject({
    pedido_id: pedidoId,
    cuenta_id: cuentaId,
    usuario_id: usuarioId,
    metodo: 'transferencia',
    monto: 1000,
    referencia: 'TRF-A',
  });
  expect(row.confirmado_en).toBeInstanceOf(Date);
});

test('segunda confirmación del mismo pedido falla con 23505', async () => {
  await expect(insertar(pedidoId, 'TRF-B')).rejects.toMatchObject({ code: '23505' });
});

test('referencia repetida en la misma cuenta falla con 23505', async () => {
  await expect(insertar(otroPedidoId, 'trf-a')).rejects.toMatchObject({ code: '23505' });
});

test('transferencia sin referencia falla con 23514', async () => {
  await expect(insertar(otroPedidoId, null)).rejects.toMatchObject({ code: '23514' });
});

test('monto cero falla con 23514', async () => {
  await expect(insertar(otroPedidoId, 'TRF-C', 0)).rejects.toMatchObject({ code: '23514' });
});
