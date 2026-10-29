/**
 * Slice 4b — precio de una línea de la tienda online (productos o catálogo).
 * Puro, sin Next/DB: lo usan el cobro server-side y (4c) el carrito.
 * El cliente no elige modalidad: se deriva de la cantidad total del producto.
 */
export type ModalidadTienda = 'detalle' | 'mayor';

export interface EntradaPrecioTienda {
  /** Precio unitario que se muestra en la tienda (prcventa o precio del catálogo). */
  base: number;
  precio_mayor: number | string | null | undefined;
  minimo_mayor: number | string | null | undefined;
  /** Cantidad total pedida del producto (sumando líneas repetidas). */
  cantidad: number;
  habilitado: boolean;
}

export interface PrecioLineaTienda {
  precio: number;
  precio_lista: number;
  modalidad: ModalidadTienda;
  ahorro: number;
}

export function precioLineaTienda(entrada: EntradaPrecioTienda): PrecioLineaTienda {
  const precio_lista = Math.round(Number(entrada.base));
  const mayor = entrada.precio_mayor === null || entrada.precio_mayor === undefined
    ? Number.NaN
    : Math.round(Number(entrada.precio_mayor));
  const minimo = entrada.minimo_mayor === null || entrada.minimo_mayor === undefined
    ? Number.NaN
    : Number(entrada.minimo_mayor);

  const aplicaMayor = entrada.habilitado === true
    && Number.isInteger(minimo) && minimo >= 1
    && Number.isFinite(mayor) && mayor > 0 && mayor < precio_lista
    && Number.isFinite(entrada.cantidad) && entrada.cantidad >= minimo;

  const precio = aplicaMayor ? mayor : precio_lista;
  return {
    precio,
    precio_lista,
    modalidad: aplicaMayor ? 'mayor' : 'detalle',
    ahorro: (precio_lista - precio) * entrada.cantidad,
  };
}
