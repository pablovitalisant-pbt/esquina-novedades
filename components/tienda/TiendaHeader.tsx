'use client';

import Link from 'next/link';
import { EMPRESA } from '@/lib/empresa';
import { useCarrito } from '@/contexts/CarritoContext';
import { MarcaLogo } from '@/components/MarcaLogo';
import { Search, ShoppingBag, MessageCircle } from 'lucide-react';

/** Header sticky compartido por la portada y el catálogo público. */
export function TiendaHeader({
  busqueda,
  onBusqueda,
}: {
  busqueda: string;
  onBusqueda: (valor: string) => void;
}) {
  const { totalItems } = useCarrito();
  return (
    <header className="sticky top-0 z-50 bg-[#21002F] text-[#FFF8EA] shadow-md">
      <div
        className="mx-auto px-3 sm:px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-2"
        style={{ maxWidth: '1152px' }}
      >
        <Link href="/" className="flex items-center gap-2 shrink-0 min-w-0">
          <MarcaLogo
            className="font-serif text-base sm:text-xl font-bold text-[#F2B936] leading-tight truncate"
            logoClassName="h-8 w-auto"
          />
        </Link>

        <div className="order-3 sm:order-2 w-full sm:flex-1 sm:w-auto relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#21002F]/60" aria-hidden />
          <input
            type="search"
            aria-label="Buscar productos"
            placeholder="Buscar por nombre o código"
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
            className="w-full h-9 rounded-full bg-[#FFF8EA] text-[#21002F] placeholder:text-[#21002F]/50 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#F2B936]"
          />
        </div>

        <div className="order-2 sm:order-3 flex items-center gap-2 shrink-0 ml-auto">
          <a
            href={EMPRESA.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-[#FFE6A0] hover:text-white px-1"
          >
            <MessageCircle className="w-4 h-4" aria-hidden />
            Ayuda
          </a>
          <button
            type="button"
            data-testid="carrito-header"
            onClick={() => window.dispatchEvent(new Event('esquina:abrir-carrito'))}
            aria-label={`Carrito, ${totalItems} artículos`}
            className="relative inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#590078] hover:bg-[#6b0090] transition-colors"
          >
            <ShoppingBag className="w-5 h-5 text-[#F2B936]" aria-hidden />
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#F2B936] text-[#21002F] text-[10px] font-bold flex items-center justify-center">
              {totalItems}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
