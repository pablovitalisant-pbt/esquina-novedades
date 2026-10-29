'use client';

import { useMemo, useState } from 'react';
import { EMPRESA } from '@/lib/empresa';
import { formatCLP } from '@/lib/utils';
import { CarritoProvider } from '@/contexts/CarritoContext';
import { CarritoDrawer } from '@/components/CarritoDrawer';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import { PlaceholderProducto, TarjetaProductoTienda } from '@/components/TarjetaProductoTienda';
import { FranjaBeneficios } from '@/components/tienda/FranjaBeneficios';
import { TiendaHeader } from '@/components/tienda/TiendaHeader';
import { BarraCategorias } from '@/components/tienda/BarraCategorias';
import { FranjaConfianza } from '@/components/tienda/FranjaConfianza';
import { TiendaFooter } from '@/components/tienda/TiendaFooter';
import { filtrarProductos } from '@/components/tienda/filtrarProductos';
import type { CategoriaTienda, OpcionEntregaTienda, ProductoTienda } from '@/lib/tienda-productos';
import { ShoppingBag } from 'lucide-react';

type Orden = 'novedades' | 'menor' | 'mayor';

type Props = {
  productos: ProductoTienda[];
  categorias: CategoriaTienda[];
  opcionesEntrega: OpcionEntregaTienda[];
  empresaSlug: string;
};

export function TiendaPortada({ productos, categorias, opcionesEntrega, empresaSlug }: Props) {
  return (
    <CarritoProvider origen="productos">
      <TiendaPortadaInner
        productos={productos}
        categorias={categorias}
        opcionesEntrega={opcionesEntrega}
        empresaSlug={empresaSlug}
      />
      <CarritoDrawer />
    </CarritoProvider>
  );
}

function TiendaPortadaInner({ productos, categorias, opcionesEntrega, empresaSlug }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [orden, setOrden] = useState<Orden>('novedades');

  // La consulta ya filtra stock; el filtro acá es defensa ante datos sucios.
  const conStock = useMemo(() => productos.filter((p) => p.saldo > 0), [productos]);

  const filtrados = useMemo(() => {
    const copia = filtrarProductos(conStock, { categoria, busqueda });
    if (orden === 'menor') copia.sort((a, b) => a.precio - b.precio);
    else if (orden === 'mayor') copia.sort((a, b) => b.precio - a.precio);
    else copia.sort((a, b) => Number(b.es_nuevo) - Number(a.es_nuevo) || b.id - a.id);
    return copia;
  }, [conStock, categoria, busqueda, orden]);

  const novedades = useMemo(() => conStock.filter((p) => p.es_nuevo).slice(0, 10), [conStock]);
  const destacados = useMemo(() => [...conStock].sort((a, b) => b.id - a.id).slice(0, 3), [conStock]);

  const opcionesActivas = opcionesEntrega.filter((o) => o.activa !== false);
  const nombresEntrega = opcionesActivas.map((o) => o.nombre).join(' · ');
  const hayRetiro = opcionesActivas.some((o) => o.codigo === 'retiro');

  return (
    <div className="min-h-screen bg-background font-sans">
      <FranjaBeneficios nombresEntrega={nombresEntrega} />
      <TiendaHeader busqueda={busqueda} onBusqueda={setBusqueda} />
      <BarraCategorias categorias={categorias} categoria={categoria} onCategoria={setCategoria} />

      {/* Hero único */}
      <section className="bg-gradient-to-br from-[#21002F] via-[#3A0A55] to-[#590078] text-[#FFF8EA]">
        <div
          className="mx-auto px-4 py-8 md:py-14 grid md:grid-cols-2 gap-6 md:gap-10 items-center"
          style={{ maxWidth: '1152px' }}
        >
          <div>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-[#F2B936] leading-tight">
              {EMPRESA.nombre}
            </h1>
            <p className="mt-3 text-base sm:text-lg text-[#FFE6A0]">
              Hogar, regalos, juguetes y más · Por mayor y por menor
            </p>
            <button
              type="button"
              onClick={() => document.getElementById('grilla-productos')?.scrollIntoView({ behavior: 'smooth' })}
              className="mt-5 inline-flex items-center rounded-full bg-[#F2B936] text-[#21002F] font-bold px-6 h-11 hover:opacity-90 transition-opacity"
            >
              Ver productos
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {destacados.map((p) => (
              <div key={p.id} className="bg-[#FFF8EA] text-[#21002F] rounded-xl overflow-hidden">
                <div className="relative aspect-square bg-[var(--muted)]">
                  {p.imagen_url ? (
                    <ImageWithFallback src={p.imagen_url} codigo={p.codigo} empresaSlug={empresaSlug} fill />
                  ) : (
                    <PlaceholderProducto codigo={p.codigo} />
                  )}
                </div>
                <div className="p-1.5 sm:p-2">
                  <p className="text-[11px] leading-tight line-clamp-2">{p.detalle}</p>
                  <p data-testid="hero-precio" className="mt-1 text-xs font-black text-[#590078]">
                    {formatCLP(p.precio)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FranjaConfianza hayRetiro={hayRetiro} />

      <div className="mx-auto px-3 sm:px-4" style={{ maxWidth: '1152px' }}>
        {/* Novedades */}
        {novedades.length > 0 && (
          <section className="py-6">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--heading)] mb-3">Novedades</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x">
              {novedades.map((p) => (
                <div key={p.id} className="w-[150px] sm:w-[180px] shrink-0 snap-start">
                  <TarjetaProductoTienda producto={p} empresaSlug={empresaSlug} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Todos los productos */}
        <section id="grilla-productos" className="py-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--heading)]">Todos los productos</h2>
            <label className="flex items-center gap-2 text-sm text-[var(--body)]">
              <span className="sr-only">Ordenar productos</span>
              <select
                aria-label="Ordenar productos"
                value={orden}
                onChange={(e) => setOrden(e.target.value as Orden)}
                className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-2 text-sm"
              >
                <option value="novedades">Novedades</option>
                <option value="menor">Menor precio</option>
                <option value="mayor">Mayor precio</option>
              </select>
            </label>
          </div>
          <p data-testid="resultados" className="text-sm text-[var(--body-subtle)] mb-4">
            {filtrados.length} {filtrados.length === 1 ? 'producto' : 'productos'}
          </p>

          {filtrados.length === 0 ? (
            <div className="text-center text-[var(--body)] py-16 flex flex-col items-center">
              <ShoppingBag className="w-14 h-14 opacity-20 mb-3" aria-hidden />
              <p className="text-lg">No encontramos productos con esos filtros.</p>
              <button
                type="button"
                onClick={() => {
                  setBusqueda('');
                  setCategoria(null);
                }}
                className="mt-4 text-sm font-semibold text-[var(--primary)] hover:underline"
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div
              data-testid="grilla"
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4"
            >
              {filtrados.map((p) => (
                <div key={p.id} data-testid="grilla-item">
                  <TarjetaProductoTienda producto={p} empresaSlug={empresaSlug} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <TiendaFooter />
    </div>
  );
}
