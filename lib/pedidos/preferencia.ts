/** Slice 9b — preferencia armada desde DB (nunca desde el body). Funciones puras. */
import { Preference } from 'mercadopago';
import { sql } from '@/lib/db';
import { elegirInitPoint, mpConfig, siteUrl } from '@/lib/mercadopago/config';
export interface LineaPreferencia {
  producto_id: number;
  codigo: string;
  detalle: string | null;
  /** Cajas o unidades según la modalidad con que se compró. */
  cantidad: number;
  precio: number | string;
}
export interface PedidoPreferencia {
  id: string;
  email_contacto: string;
  entrega_codigo: string;
  entrega_costo: number | string;
  entrega_nombre?: string | null;
  expira_en: string | Date;
}

function precioEntero(valor: number | string, etiqueta: string): number {
  const numero = Math.round(Number(valor));
  if (!Number.isFinite(numero) || numero < 0) throw new Error(`precio inválido para ${etiqueta}`);
  return numero;
}

export function construirItemsPreferencia(
  lineas: LineaPreferencia[],
  entregaCosto: number | string,
  entregaNombre?: string | null,
  entregaCodigo?: string | null,
) {
  const items = lineas.map((linea) => ({
    id: String(linea.producto_id),
    title: linea.detalle ?? linea.codigo,
    quantity: linea.cantidad,
    unit_price: precioEntero(linea.precio, linea.codigo),
    currency_id: 'CLP',
  }));
  const costo = precioEntero(entregaCosto, 'despacho');
  if (costo > 0) {
    items.push({
      id: 'despacho',
      title: `Despacho: ${entregaNombre ?? entregaCodigo ?? 'entrega'}`,
      quantity: 1,
      unit_price: costo,
      currency_id: 'CLP',
    });
  }
  return items;
}

export function construirPreferencia(
  pedido: PedidoPreferencia,
  lineas: LineaPreferencia[],
  urlSitio: string,
  ahora: Date = new Date(),
) {
  const expira = new Date(pedido.expira_en);
  if (Number.isNaN(expira.getTime())) throw new Error('pedido.expira_en inválido para la preferencia');
  const backUrl = `${urlSitio}/pedido/${pedido.id}`;
  return {
    items: construirItemsPreferencia(
      lineas, pedido.entrega_costo, pedido.entrega_nombre, pedido.entrega_codigo,
    ),
    payer: { email: pedido.email_contacto },
    external_reference: pedido.id,
    notification_url: `${urlSitio}/api/mercadopago/webhook`,
    back_urls: { success: backUrl, failure: backUrl, pending: backUrl },
    auto_return: 'approved',
    expires: true,
    expiration_date_from: ahora.toISOString(),
    // Viene de pedidos.expira_en (leído de DB), no de un +36 h recalculado.
    expiration_date_to: expira.toISOString(),
  };
}

/**
 * Slice 9c — relee pedido e ítems desde DB (nunca del body), crea la
 * preferencia con idempotencyKey = pedido.id y persiste id + init point
 * solo si el pedido sigue `pendiente_pago`.
 */
export async function crearPreferenciaPedido(
  pedidoId: string,
): Promise<{ preferenceId: string; initPoint: string }> {
  const [pedido] = await sql`
    SELECT p.id, p.email_contacto, p.entrega_codigo, p.entrega_costo,
           p.expira_en::text AS expira_en, o.nombre AS entrega_nombre
    FROM public.pedidos p
    LEFT JOIN public.opciones_entrega o ON o.codigo = p.entrega_codigo
    WHERE p.id = ${pedidoId}
  `;
  if (!pedido) throw new Error('pedido inexistente para la preferencia');

  const lineas = await sql`
    SELECT producto_id, codigo, detalle, cantidad, precio
    FROM public.pedido_items
    WHERE pedido_id = ${pedidoId}
  `;

  const body = construirPreferencia(
    pedido as PedidoPreferencia,
    lineas as LineaPreferencia[],
    siteUrl(),
  );
  const preferencia = await new Preference(mpConfig()).create({
    body,
    requestOptions: { idempotencyKey: pedidoId },
  });
  if (!preferencia.id) throw new Error('Mercado Pago no devolvió el id de la preferencia');
  const initPoint = elegirInitPoint(preferencia);

  await sql`
    UPDATE public.pedidos
    SET mp_preference_id = ${preferencia.id}, mp_init_point = ${initPoint}
    WHERE id = ${pedidoId} AND estado = 'pendiente_pago'
  `;
  return { preferenceId: preferencia.id, initPoint };
}
