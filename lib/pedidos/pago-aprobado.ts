import { sql } from '@/lib/db';
import { convertirPedido } from '@/lib/pedidos/convertir';
import { registrarCobroPedido } from '@/lib/pedidos/cobro-pedido';
import { usuarioSistema } from '@/lib/pedidos/usuario-sistema';

// Máquina de estados de un pago `approved` (contrato §4.4). Idempotente: cada
// transición es un UPDATE condicionado y el cobro no se duplica.
// expirado/rechazado → pagado_tardio sin tocar stock: es revisión manual.

async function marcarRevision(id: string, motivo: string) {
  await sql`
    UPDATE pedidos SET estado = 'revision', mp_revision_motivo = ${motivo}
    WHERE id = ${id} AND estado NOT IN ('revision', 'pagado_tardio', 'convertido')
  `;
  // Un pedido convertido nunca sale de 'convertido': solo se anota el motivo.
  await sql`UPDATE pedidos SET mp_revision_motivo = ${motivo} WHERE id = ${id} AND estado = 'convertido'`;
}

async function cobrar(id: string, paymentId: string) {
  if ((await registrarCobroPedido(id, paymentId)) === 'sin_cuenta') {
    // Queda convertido (nota creada); el admin ve el motivo.
    await sql`
      UPDATE pedidos SET mp_revision_motivo = ${'Cobro no registrado: falta caja_config.mp_cuenta_id'}
      WHERE id = ${id}
    `;
  }
}

export async function pagoAprobado(
  pedidoId: string,
  pago: { id: number | string; transaction_amount: number; currency_id: string }
): Promise<void> {
  const pid = String(pago.id);
  const rows = await sql`
    UPDATE pedidos SET mp_payment_id = ${pid}, mp_fecha_pago = NOW()
    WHERE id = ${pedidoId} AND (mp_payment_id IS NULL OR mp_payment_id = ${pid})
    RETURNING estado, total, caja_movimiento_id
  `;
  if (rows.length === 0) return marcarRevision(pedidoId, 'Segundo pago aprobado para el mismo pedido');

  const { estado, total, caja_movimiento_id } = rows[0];
  if (Number(pago.transaction_amount) !== Number(total) || pago.currency_id !== 'CLP') {
    return marcarRevision(pedidoId, `Pago ${pid}: ${pago.transaction_amount} ${pago.currency_id}, esperado ${total} CLP`);
  }

  if (estado === 'expirado' || estado === 'rechazado') {
    await sql`
      UPDATE pedidos SET estado = 'pagado_tardio'
      WHERE id = ${pedidoId} AND estado IN ('expirado', 'rechazado')
    `;
  } else if (estado === 'pendiente' || estado === 'descartado') {
    await marcarRevision(pedidoId, `Pago ${pid} sobre pedido no online (${estado})`);
  } else if (estado === 'convertido') {
    if (!caja_movimiento_id) await cobrar(pedidoId, pid);
  } else if (estado === 'pendiente_pago' || estado === 'pagado') {
    await sql`UPDATE pedidos SET estado = 'pagado' WHERE id = ${pedidoId} AND estado = 'pendiente_pago'`;
    const u = await usuarioSistema();
    const r = await convertirPedido(pedidoId, u.id, u.nombre);
    if (r.status !== 201) {
      // Ejecución concurrente (mismo pago notificado dos veces): ya lo convirtió la otra.
      const [p] = await sql`SELECT estado FROM pedidos WHERE id = ${pedidoId}`;
      if (p?.estado !== 'convertido') return marcarRevision(pedidoId, `Pago ${pid} aprobado pero no se pudo convertir: ${r.body?.error}`);
    }
    await cobrar(pedidoId, pid);
  }
}
