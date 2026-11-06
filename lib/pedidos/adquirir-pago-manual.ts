import { sql } from '@/lib/db';

export type ResultadoPagoManual = 'adquirido' | 'reintento' | 'conflicto';

type Args = {
  pedidoId: string;
  cuentaId: number;
  usuarioId: number;
  monto: number;
  referencia?: string | null;
};

const MAX_INT4 = 2_147_483_647;

// Referencia bancaria: trim; vacía → null (efectivo). >128 es inválida y se
// rechaza, no se degrada a null (eso la volvería válida como efectivo).
function normalizarReferencia(referencia?: string | null): string | null | false {
  const r = referencia?.trim() ?? '';
  if (r.length === 0) return null;
  return r.length <= 128 ? r : false;
}

// N04b1 — Adquisición atómica del pago manual. Una sola sentencia CTE: el
// UPDATE del pedido y el INSERT del registro viven o mueren juntos, así que
// un 23505 de referencia duplicada revierte también el cambio de estado.
// No toca stock: la reserva sigue reservada; N04c la convierte.
export async function adquirirPagoManual({
  pedidoId,
  cuentaId,
  usuarioId,
  monto,
  referencia,
}: Args): Promise<ResultadoPagoManual> {
  if (!Number.isInteger(monto) || monto <= 0 || monto > MAX_INT4) return 'conflicto';
  const ref = normalizarReferencia(referencia);
  if (ref === false) return 'conflicto';

  let adquirido = false;
  try {
    const rows = await sql`
      WITH p AS (
        UPDATE pedidos SET estado = 'pagado'
        WHERE id = ${pedidoId}::uuid
          AND estado = 'pendiente_pago'
          AND stock_reservado
          AND expira_en > NOW()
          AND metodo_pago IN ('efectivo', 'transferencia')
          AND total = ${monto}::int
          AND (
            (metodo_pago = 'transferencia' AND ${ref}::text IS NOT NULL)
            OR (metodo_pago = 'efectivo' AND ${ref}::text IS NULL)
          )
          AND EXISTS (
            SELECT 1 FROM caja_cuentas c
            WHERE c.id = ${cuentaId}::int AND c.activa AND c.moneda = 'CLP'
          )
        RETURNING id, metodo_pago
      ), ins AS (
        INSERT INTO pedido_pagos_manuales
          (pedido_id, cuenta_id, usuario_id, metodo, monto, referencia)
        SELECT p.id, ${cuentaId}::int, ${usuarioId}::int, p.metodo_pago,
               ${monto}::int,
               CASE WHEN p.metodo_pago = 'transferencia' THEN ${ref}::text END
        FROM p
        RETURNING pedido_id
      )
      SELECT pedido_id FROM ins
    `;
    adquirido = rows.length > 0;
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return 'conflicto';
    throw e;
  }
  if (adquirido) return 'adquirido';

  // Sin adquisición: solo es reintento si ya existe el mismo registro.
  const [pago] = await sql`
    SELECT monto, cuenta_id, referencia FROM pedido_pagos_manuales
    WHERE pedido_id = ${pedidoId}::uuid
  `;
  if (!pago) return 'conflicto';
  return Number(pago.monto) === monto &&
    Number(pago.cuenta_id) === cuentaId &&
    (pago.referencia ?? null) === ref
    ? 'reintento'
    : 'conflicto';
}
