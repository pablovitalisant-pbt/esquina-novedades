/** Slice 9b — preferencia armada desde DB (nunca desde el body). Funciones puras. */
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
