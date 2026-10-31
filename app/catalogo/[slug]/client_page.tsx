'use client';

import { useEffect, useMemo, useState } from 'react';
import { CarritoProvider } from '@/contexts/CarritoContext';
import { CarritoDrawer } from '@/components/CarritoDrawer';
import { TarjetaProductoTienda } from '@/components/TarjetaProductoTienda';
import { TiendaHeader } from '@/components/tienda/TiendaHeader';
import { BarraCategorias } from '@/components/tienda/BarraCategorias';
import { TiendaFooter } from '@/components/tienda/TiendaFooter';
import { filtrarProductos } from '@/components/tienda/filtrarProductos';
import { ShoppingBag } from 'lucide-react';

type CatalogoProducto = {
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
  minimo_mayor?: number | null;
  categoria?: string | null;
};

type CatalogoPublico = {
  titulo: string;
  descripcion: string | null;
  empresa_slug: string;
  mostrar_precio: boolean;
  mostrar_stock?: boolean;
  productos: CatalogoProducto[];
};

export function PublicCatalogoClient({ data, slug }: { data: CatalogoPublico; slug: string }) {
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('print=1')) {
      setTimeout(() => window.print(), 800);
    }
  }, []);

  return (
    <CarritoProvider origen="catalogo" origen_slug={slug}>
      <CatalogoTienda data={data} />
      <CarritoDrawer />
    </CarritoProvider>
  );
}

/** Catálogo público con el diseño de la tienda. */
function CatalogoTienda({ data }: { data: CatalogoPublico }) {
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);

  const categorias = useMemo(() => {
    const nombres = new Set<string>();
    for (const p of data.productos) if (p.categoria) nombres.add(p.categoria);
    return [...nombres].sort().map((nombre) => ({ id: nombre, nombre }));
  }, [data.productos]);

  const filtrados = useMemo(
    () => filtrarProductos(data.productos, { categoria, busqueda }),
    [data.productos, categoria, busqueda],
  );

  return (
    <div data-testid="catalogo-tienda" className="min-h-screen bg-background font-sans">
      <TiendaHeader busqueda={busqueda} onBusqueda={setBusqueda} />
      <BarraCategorias categorias={categorias} categoria={categoria} onCategoria={setCategoria} />

      <div className="mx-auto px-4 py-6 text-center" style={{ maxWidth: '1152px' }}>
        <h1 className="font-serif text-3xl md:text-4xl font-bold leading-tight text-[var(--heading)]">
          {data.titulo}
        </h1>
        {data.descripcion && (
          <p className="mt-2 text-base text-[var(--body)] max-w-2xl mx-auto">{data.descripcion}</p>
        )}
      </div>

      <div className="mx-auto px-3 sm:px-4 pb-8" style={{ maxWidth: '1152px' }}>
        {filtrados.length === 0 ? (
          <div className="text-center text-[var(--body)] py-16 flex flex-col items-center">
            <ShoppingBag className="w-14 h-14 opacity-20 mb-3" aria-hidden />
            <p className="text-lg">No hay productos disponibles en este catálogo.</p>
          </div>
        ) : (
          <div
            data-testid="catalogo-grilla"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 print:block print:space-y-0"
          >
            {filtrados.map((p) => (
              <div key={p.id} className="print-page" data-testid="catalogo-item">
                <TarjetaProductoTienda
                  producto={{
                    id: p.id,
                    codigo: p.codigo,
                    detalle: p.detalle ?? null,
                    imagen_url: p.imagen_url,
                    es_nuevo: p.es_nuevo,
                    precio: p.precio_catalogo,
                    precio_mayor: p.precio_mayor ?? null,
                    minimo_mayor: p.minimo_mayor ?? null,
                    saldo: p.saldo ?? null,
                  }}
                  mostrarPrecio={data.mostrar_precio}
                  mostrarNuevo={p.es_nuevo}
                  mostrarStock={Boolean(data.mostrar_stock)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <TiendaFooter />
    </div>
  );
}
