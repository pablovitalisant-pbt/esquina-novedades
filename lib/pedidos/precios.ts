/**
 * Slice 7b — precios, subtotales y total SIEMPRE server-side.
 * El cliente solo aporta producto_id, modalidad y cantidad; cualquier
 * precio/subtotal/total/entrega_costo del body se ignora por construcción.
 * Funciones puras: reciben las filas de DB ya leídas por el route handler.
 */

import flags from '@/config/feature-flags.json';

export type Modalidad = 'detalle' | 'mayor';
export type Origen = 'productos' | 'catalogo';

export class ErrorPrecio extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErrorPrecio';
  }
}

export interface ProductoPrecio {
  id: number;
  codigo: string;
  detalle: string | null;
  prcventa: number | string | null;
  precio_mayor: number | string | null;
  cantcaja: number | string | null;
  activo?: boolean | null;
  [extra: string]: unknown; // el body del cliente se tolera pero nunca se lee
}

export interface OpcionEntrega {
  codigo: string;
  /** Slice 9c: nombre visible para el ítem de despacho de la preferencia. */
  nombre?: string | null;
  costo: number | string;
  requiere_direccion: boolean;
  activa?: boolean;
}

export interface LineaCalculada {
  producto_id: number;
  codigo: string;
  detalle: string | null;
  modalidad: Modalidad;
  cantidad: number;
  precio: number;
  subtotal: number;
  /** Unidades de stock que consume la línea (siempre cantidad: no hay venta por caja). */
  unidades: number;
}

export interface OpcionesCalculo {
  origen: Origen;
  /** Precio ya resuelto para origen='catalogo' (margen + override), por producto_id. */
  preciosCatalogo?: Record<number, number | null | undefined>;
  entrega: OpcionEntrega;
  direccion_entrega?: string | null;
}

export interface PedidoCalculado {
  lineas: LineaCalculada[];
  entrega_codigo: string;
  entrega_costo: number;
  direccion_entrega: string | null;
  total: number;
}

function precioUnidad(producto: ProductoPrecio, origen: Origen, precioCatalogo?: number | null): number {
  if (origen === 'catalogo') {
    if (typeof precioCatalogo !== 'number' || !Number.isFinite(precioCatalogo) || precioCatalogo < 0) {
      throw new ErrorPrecio('precio de catálogo no disponible para el producto');
    }
    return Math.round(precioCatalogo); // CLP entero; precioCatalogoBase ya lo entrega así
  }
  const prcventa = Number(producto.prcventa);
  if (!Number.isFinite(prcventa) || prcventa < 0) {
    throw new ErrorPrecio(`producto ${producto.codigo} sin precio de venta`);
  }
  return Math.round(prcventa);
}

export function calcularLinea(
  item: { producto_id: number; modalidad: unknown; cantidad: unknown },
  producto: ProductoPrecio | undefined,
  opciones: Pick<OpcionesCalculo, 'origen'> & { precioCatalogo?: number | null },
): LineaCalculada {
  if (!producto) throw new ErrorPrecio('producto inexistente');
  if (producto.activo === false) throw new ErrorPrecio(`producto ${producto.codigo} inactivo`);

  const cantidad = item?.cantidad as number;
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    throw new ErrorPrecio('cada item.cantidad debe ser un entero > 0');
  }

  // La tienda sigue mandando 'unidad'; el servidor normaliza a 'detalle'.
  // 'caja' se acepta como alias legacy de 'mayor' (venta mayorista por unidad).
  const modalidad = item?.modalidad;
  if (modalidad !== 'unidad' && modalidad !== 'detalle' && modalidad !== 'caja' && modalidad !== 'mayor') {
    throw new ErrorPrecio("modalidad debe ser 'unidad', 'detalle', 'caja' o 'mayor'");
  }
  const mayor = modalidad === 'caja' || modalidad === 'mayor';

  // Hotfix: defensa en profundidad — la tienda online no vende por mayor.
  if (flags['tienda-mayor-online'] !== true && mayor) {
    throw new ErrorPrecio('El precio por mayor no está disponible en la tienda online');
  }

  let precio: number;
  if (mayor) {
    const precioMayor = Number(producto.precio_mayor);
    if (producto.precio_mayor === null || !Number.isInteger(precioMayor) || precioMayor <= 0) {
      throw new ErrorPrecio(`producto ${producto.codigo} sin precio mayorista`);
    }
    precio = precioMayor;
  } else {
    precio = precioUnidad(producto, opciones.origen, opciones.precioCatalogo);
  }

  return {
    producto_id: producto.id,
    codigo: producto.codigo,
    detalle: producto.detalle ?? null,
    modalidad: mayor ? 'mayor' : 'detalle',
    cantidad,
    precio,
    subtotal: cantidad * precio,
    // Venta mayorista = precio_mayor POR UNIDAD; no existe venta por caja.
    unidades: cantidad,
  };
}

export function calcularPedido(
  items: Array<{ producto_id: number; modalidad: unknown; cantidad: unknown }>,
  productos: ProductoPrecio[],
  opciones: OpcionesCalculo,
): PedidoCalculado {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ErrorPrecio('items debe ser un array con al menos 1 elemento');
  }

  const porId = new Map(productos.map((p) => [p.id, p]));
  const lineas = items.map((item) => calcularLinea(item, porId.get(item.producto_id), {
    origen: opciones.origen,
    precioCatalogo: opciones.preciosCatalogo?.[item.producto_id],
  }));

  const entrega = opciones.entrega;
  if (!entrega || entrega.activa === false) {
    throw new ErrorPrecio('opción de entrega inexistente o inactiva');
  }
  const entregaCosto = Number(entrega.costo);
  if (!Number.isInteger(entregaCosto) || entregaCosto < 0) {
    throw new ErrorPrecio('costo de entrega inválido');
  }
  const direccion = typeof opciones.direccion_entrega === 'string'
    ? opciones.direccion_entrega.trim()
    : '';
  if (entrega.requiere_direccion && !direccion) {
    throw new ErrorPrecio('direccion_entrega es requerida para esta opción de entrega');
  }

  return {
    lineas,
    entrega_codigo: entrega.codigo,
    entrega_costo: entregaCosto,
    direccion_entrega: direccion || null,
    total: lineas.reduce((suma, l) => suma + l.subtotal, 0) + entregaCosto,
  };
}
