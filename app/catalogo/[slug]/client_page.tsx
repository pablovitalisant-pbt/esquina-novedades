'use client';

import { useEffect } from 'react';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import { CarritoProvider } from '@/contexts/CarritoContext';
import { BotonAgregarPedido } from '@/components/BotonAgregarPedido';
import { CarritoDrawer } from '@/components/CarritoDrawer';
import { formatCLP } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ShoppingBag } from 'lucide-react';
import { CatalogFooter } from '@/components/CatalogFooter';

type CatalogoPublico = {
  titulo: string;
  descripcion: string | null;
  empresa_slug: string;
  mostrar_precio: boolean;
  mostrar_stock?: boolean;
  productos: Array<{
    id: number;
    codigo: string;
    detalle?: string | null;
    imagen_url: string | null;
    es_nuevo: boolean;
    saldo?: number;
    cantcaja: number;
    umed: string;
    precio_catalogo: number | null;
    precio_mayor?: number | null;
  }>;
};

export function PublicCatalogoClient({ data, slug }: { data: CatalogoPublico; slug: string }) {

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('print=1')) {
      setTimeout(() => window.print(), 800);
    }
  }, []);

  const grid = (
    <div className="min-h-screen bg-[var(--muted)] bg-[var(--muted)]950 font-sans">
      <div className="catalogo-header bg-white bg-[var(--muted)]900 border-b py-8 px-4 text-center shadow-sm">
        <div className="container max-w-5xl mx-auto space-y-3">
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-[var(--primary)] dark:text-[var(--primary)]">
            {data.titulo}
          </h1>
          {data.descripcion && (
            <p className="text-[var(--body)]500 dark:text-[var(--body)] max-w-2xl mx-auto text-lg">
              {data.descripcion}
            </p>
          )}
        </div>
      </div>

      <div className="container max-w-6xl mx-auto px-4 py-12">
        {!data.productos?.length ? (
          <div className="text-center text-[var(--body)] py-20 flex flex-col items-center">
            <ShoppingBag className="w-16 h-16 opacity-20 mb-4" />
            <p className="text-xl">No hay productos disponibles en este catálogo.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 print:block print:space-y-0">
            {data.productos.map((p) => (
              <div key={p.id} className="print-page bg-white bg-[var(--muted)]900 border rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all flex flex-col group">
                <div className="relative aspect-square bg-[var(--muted)] bg-[var(--muted)]800">
                  <ImageWithFallback
                    src={p.imagen_url}
                    codigo={p.codigo}
                    empresaSlug={data.empresa_slug}
                    fill
                  />
                  {p.es_nuevo && (
                    <div className="absolute top-2 left-2 z-10">
                      <Badge className="bg-[var(--success)]/10500 font-bold border-none shadow-sm">NUEVO</Badge>
                    </div>
                  )}
                </div>
                <div className="p-4 flex flex-col flex-1 gap-1">
                  <div className="font-mono text-xs text-[var(--body)] font-semibold">{p.codigo}</div>
                  <h3 className="font-bold text-base leading-tight line-clamp-2 flex-1">{p.detalle}</h3>
                  {p.cantcaja > 1 && (
                    <div className="text-xs text-[var(--body)]">Packing: {p.cantcaja} {p.umed}/Caja</div>
                  )}
                  {data.mostrar_stock && p.cantcaja > 0 && p.saldo != null && p.saldo > 0 && (
                    <div className="text-xs text-[var(--body)]">Stock disponible: {Math.floor(p.saldo / p.cantcaja)} cajas</div>
                  )}
                  {data.mostrar_precio && p.precio_catalogo !== null && (
                    <div className="mt-2">
                      <div className="text-[10px] uppercase font-bold text-[var(--body)] tracking-wider">Precio</div>
                      <div className="text-2xl font-black text-[var(--primary)] dark:text-[var(--primary)] leading-none">
                        {formatCLP(p.precio_catalogo)}
                      </div>
                    </div>
                  )}
                  <div className="mt-3">
                    <BotonAgregarPedido
                      item={{ producto_id: p.id, codigo: p.codigo, detalle: p.detalle ?? null, precio: p.precio_catalogo ?? null, precio_mayor: p.precio_mayor ?? null, cantcaja: p.cantcaja, stock: p.saldo, umed: p.umed }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CatalogFooter />
    </div>
  );

  return (
    <CarritoProvider origen="catalogo" origen_slug={slug}>
      {grid}
      <CarritoDrawer />
    </CarritoProvider>
  );
}
