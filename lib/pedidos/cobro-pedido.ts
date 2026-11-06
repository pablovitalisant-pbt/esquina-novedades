import { sql } from '@/lib/db';
import { EMPRESA } from '@/lib/empresa';
import { usuarioSistema } from '@/lib/pedidos/usuario-sistema';

type Actor = { id: number; nombre: string };

// CTE compartido: bloquea el pedido y solo inserta si caja_movimiento_id sigue
// NULL. Monto = pedido.total (incluye envío); a la nota se imputa solo la suma
// de ítems.
async function cobrarPedido(
  pedidoId: string,
  cuentaId: number,
  actor: Actor,
  formaPago: string,
  obs: string
): Promise<boolean> {
  const rows = await sql`
    WITH p AS (
      SELECT id, total, nombre_contacto, prenota_id FROM pedidos
      WHERE id = ${pedidoId} AND estado = 'convertido' AND prenota_id IS NOT NULL
        AND caja_movimiento_id IS NULL
      FOR UPDATE
    ), mov AS (
      INSERT INTO caja_movimientos (fecha, tipo, kcodcli2, nombre_cliente, cuenta_id, moneda, monto,
                                    forma_pago, observaciones, empresa, es_credito, usuario_id, usuario_nombre)
      SELECT CURRENT_DATE, 'cobro', NULL, p.nombre_contacto, ${cuentaId}, 'CLP', p.total,
             ${formaPago}, ${obs}, ${EMPRESA.slug}, false, ${actor.id}, ${actor.nombre}
      FROM p RETURNING id
    ), upd AS (
      UPDATE pedidos SET caja_movimiento_id = (SELECT id FROM mov)
      WHERE id IN (SELECT id FROM p) AND caja_movimiento_id IS NULL AND EXISTS (SELECT 1 FROM mov)
      RETURNING id
    ), nota AS (
      INSERT INTO caja_movimiento_notas (movimiento_id, empresa, prenota_id, monto_aplicado)
      SELECT (SELECT id FROM mov), ${EMPRESA.slug}, p.prenota_id,
             LEAST(p.total, COALESCE((SELECT SUM(subtotal) FROM prenota_items WHERE prenota_id = p.prenota_id), 0))
      FROM p WHERE EXISTS (SELECT 1 FROM upd)
      RETURNING id
    )
    SELECT id FROM mov
  `;
  return rows.length > 0;
}

// Cobro MP en Caja Mayor (firma y comportamiento originales).
export async function registrarCobroPedido(
  pedidoId: string,
  paymentId: string
): Promise<'registrado' | 'ya' | 'sin_cuenta'> {
  const cfg = await sql`SELECT valor FROM caja_config WHERE clave = 'mp_cuenta_id'`;
  if (cfg.length === 0) return 'sin_cuenta';
  const cuentaId = Number(cfg[0].valor);
  const obs = `Pedido online ${pedidoId} · Mercado Pago ${paymentId}`;
  const ok = await cobrarPedido(pedidoId, cuentaId, await usuarioSistema(), 'mercadopago', obs);
  return ok ? 'registrado' : 'ya';
}

// N04c — Cobro de un pago manual (efectivo/transferencia) ya confirmado en
// pedido_pagos_manuales. Sin invocar en runtime hasta N04c2.
export async function registrarCobroManualPedido(
  pedidoId: string
): Promise<'registrado' | 'ya' | 'sin_confirmacion'> {
  const [pago] = await sql`
    SELECT p.cuenta_id, p.usuario_id, p.metodo, p.referencia, u.nombre AS usuario_nombre
    FROM pedido_pagos_manuales p JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.pedido_id = ${pedidoId}::uuid
  `;
  if (!pago) return 'sin_confirmacion';
  const obs = `Pedido online ${pedidoId} · ${pago.metodo}` +
    (pago.referencia ? ` ${pago.referencia}` : '');
  const ok = await cobrarPedido(
    pedidoId,
    Number(pago.cuenta_id),
    { id: Number(pago.usuario_id), nombre: pago.usuario_nombre },
    pago.metodo,
    obs
  );
  return ok ? 'registrado' : 'ya';
}
