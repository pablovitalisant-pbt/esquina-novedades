// Etiquetas de pedidos compartidas por la vista /pedidos y el PDF del pedido.
// (No duplicar: si cambia una etiqueta, cambia en ambos lados.)

export const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  pendiente_pago: 'Pendiente de pago',
  pagado: 'Pagado',
  pagado_tardio: 'Pagado tarde',
  revision: 'En revisión',
  convertido: 'Convertido',
  descartado: 'Descartado',
  expirado: 'Expirado',
  rechazado: 'Rechazado',
};

export const ENTREGA_LABEL: Record<string, string> = {
  retiro: 'Retiro en tienda',
  delivery_iquique: 'Delivery Iquique',
  delivery_alto_hospicio: 'Delivery Alto Hospicio',
  envio_arica: 'Envío a Arica',
};

export const ETIQUETA_PAGO: Record<string, string> = {
  mercadopago: 'Mercado Pago',
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
};
