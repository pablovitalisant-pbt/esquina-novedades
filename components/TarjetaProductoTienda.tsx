'use client';

import { ImageWithFallback } from '@/components/ImageWithFallback';
import { BotonAgregarPedido } from '@/components/BotonAgregarPedido';
import { formatCLP } from '@/lib/utils';
import { ShoppingBag } from 'lucide-react';
import type { ProductoTienda } from '@/lib/tienda-productos';

/** Forma mínima que necesitan las tarjetas de la tienda. */
export type ProductoTarjeta = Pick<
  ProductoTienda,
  'id' | 'codigo' | 'detalle' | 'imagen_url' | 'es_nuevo' | 'precio_mayor' | 'minimo_mayor'
> & {
  precio: number | null;
  saldo?: number | null;
};

/** Placeholder de marca para productos sin foto: violeta + bolsa dorada + código. */
export function PlaceholderProducto({ codigo }: { codigo: string }) {
  return (
    <div
      data-testid="placeholder-producto"
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#21002F] to-[#590078]"
    >
      <ShoppingBag className="w-10 h-10 text-[#F2B936]" aria-hidden />
      <span className="font-mono text-[11px] text-[#FFE6A0] px-2 text-center break-all">{codigo}</span>
    </div>
  );
}

/**
 * Tarjeta compartida por la portada y el catálogo público. El precio por mayor
 * nunca se muestra (se descubre en el carrito). Con `mostrarPrecio=false` no
 * hay precio ni botón, igual que el catálogo con precios ocultos.
 */
export function TarjetaProductoTienda({
  producto,
  empresaSlug,
  mostrarPrecio = true,
  mostrarStock = false,
  className = '',
}: {
  producto: ProductoTarjeta;
  empresaSlug: string;
  mostrarPrecio?: boolean;
  mostrarStock?: boolean;
  className?: string;
}) {
  const hayStock = mostrarStock && producto.saldo != null && producto.saldo > 0;
  return (
    <article
      className={`h-full flex flex-col bg-[var(--card)] border border-[var(--border-default)] rounded-2xl overflow-hidden ${className}`}
    >
      <div className="relative aspect-square bg-[var(--muted)]">
        {producto.imagen_url ? (
          <ImageWithFallback src={producto.imagen_url} codigo={producto.codigo} empresaSlug={empresaSlug} fill />
        ) : (
          <PlaceholderProducto codigo={producto.codigo} />
        )}
        {producto.es_nuevo && (
          <span className="absolute top-2 left-2 z-10 bg-[var(--accent)] text-[var(--accent-foreground)] text-[10px] font-bold px-2 py-0.5 rounded-full">
            NUEVO
          </span>
        )}
      </div>
      <div className="p-2.5 sm:p-3 flex flex-col flex-1 gap-1.5">
        <h3 className="text-sm font-semibold leading-tight line-clamp-2 flex-1 text-[var(--heading)]">
          {producto.detalle}
        </h3>
        {hayStock && (
          <div className="text-xs text-[var(--body)]">Stock disponible: {producto.saldo} unidades</div>
        )}
        {mostrarPrecio && producto.precio != null && (
          <div data-testid="precio-menor" className="text-lg sm:text-xl font-black text-[var(--primary)] leading-none">
            {formatCLP(producto.precio)}
          </div>
        )}
        {mostrarPrecio && (
          <BotonAgregarPedido
            item={{
              producto_id: producto.id,
              codigo: producto.codigo,
              detalle: producto.detalle,
              precio: producto.precio,
              precio_mayor: producto.precio_mayor ?? null,
              minimo_mayor: producto.minimo_mayor ?? null,
            }}
          />
        )}
      </div>
    </article>
  );
}
