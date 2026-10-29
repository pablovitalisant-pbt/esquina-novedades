'use client';

import { ImageWithFallback } from '@/components/ImageWithFallback';
import { CarritoProvider } from '@/contexts/CarritoContext';
import { BotonAgregarPedido } from '@/components/BotonAgregarPedido';
import { CarritoDrawer } from '@/components/CarritoDrawer';
import { formatCLP } from '@/lib/utils';
import { ShoppingBag, ArrowLeft } from 'lucide-react';
import { CatalogFooter } from '@/components/CatalogFooter';
import Link from 'next/link';

interface ProductoItem {
  codigo: string;
  id: number;
  detalle: string | null;
  imagen_url: string | null;
  cantcaja: number;
  umed: string;
  precio: number;
  precio_mayor: number | null;
  minimo_mayor: number | null;
  saldo: number;
  es_nuevo: boolean;
}

export function ProductosPublicos({ productos, empresaSlug }: { productos: ProductoItem[]; empresaSlug: string }) {

  const grid = (
    <div className="min-h-screen bg-background font-sans">
      <header className="border-b border-[var(--border-default)]">
        <div className="mx-auto px-6 h-16 flex items-center gap-4" style={{ maxWidth: '1152px' }}>
          <Link href="/" className="text-sm text-[var(--body-subtle)] hover:text-[var(--primary)] transition-colors inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
          <span className="font-bold text-lg text-[var(--heading)]">Catálogo Completo</span>
        </div>
      </header>

      <section className="py-12">
        <div className="mx-auto px-6" style={{ maxWidth: '1152px' }}>
          <h1 className="text-3xl md:text-4xl font-bold leading-[1.1] tracking-tight text-[var(--heading)] mb-2">
            Todos los Productos
          </h1>
          <p className="text-lg text-[var(--body)] mb-10">
            {productos.length} productos disponibles con stock inmediato.
          </p>

          {!productos?.length ? (
            <div className="text-center text-[var(--body)] py-20 flex flex-col items-center">
              <ShoppingBag className="w-16 h-16 opacity-20 mb-4" />
              <p className="text-xl">No hay productos disponibles en este momento.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {productos.map((p) => (
                <div
                  key={p.id}
                  className="bg-[var(--card)] border border-[var(--border-default)] rounded-[48px] overflow-hidden flex flex-col"
                >
                  <div className="relative aspect-square bg-[var(--muted)]">
                    <ImageWithFallback
                      src={p.imagen_url}
                      codigo={p.codigo}
                      empresaSlug={empresaSlug}
                      fill
                    />
                    {p.es_nuevo && (
                      <div className="absolute top-3 right-3 z-10">
                        <span className="bg-[var(--success)] text-white text-xs font-bold px-3 py-1 rounded-full">NUEVO</span>
                      </div>
                    )}
                  </div>
                  <div className="p-5 flex flex-col flex-1 gap-1.5">
                    <span className="font-mono text-xs text-[var(--body-subtle)] font-semibold">{p.codigo}</span>
                    <h3 className="font-bold text-base leading-tight line-clamp-2 flex-1 text-[var(--heading)]">
                      {p.detalle}
                    </h3>
                    {p.cantcaja > 1 && (
                      <span className="text-xs text-[var(--body)]">Packing: {p.cantcaja} {p.umed}/Caja</span>
                    )}
                    <div className="mt-2 pt-3 border-t border-[var(--border-default)]">
                      <span className="text-[10px] uppercase font-bold text-[var(--body-subtle)] tracking-wider">Precio</span>
                      <div className="text-2xl font-black text-[var(--primary)] leading-none">{formatCLP(p.precio)}</div>
                    </div>
                    <div className="mt-3">
                      <BotonAgregarPedido
                        item={{ producto_id: p.id, codigo: p.codigo, detalle: p.detalle, precio: p.precio, precio_mayor: p.precio_mayor, minimo_mayor: p.minimo_mayor, stock: p.saldo, umed: p.umed }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <CatalogFooter />
    </div>
  );

  return (
    <CarritoProvider origen="productos">
      {grid}
      <CarritoDrawer />
    </CarritoProvider>
  );
}
