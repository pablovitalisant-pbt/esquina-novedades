'use client';

import { useState, useRef } from 'react';
import { Producto } from '@/types';
import { Badge } from '@/components/ui/badge';
import { ImageWithFallback } from './ImageWithFallback';
import { ClipboardList } from 'lucide-react';
import { AgregarANotaVentaModal } from '@/components/AgregarANotaVentaModal';
import { formatCLP } from '@/lib/utils';
import flags from '@/config/feature-flags.json';

interface ProductCardProps {
  producto: Producto;
  empresaSlug: string;
  onClick: (producto: Producto) => void;
  ocultarPrecios?: boolean;
  rol?: string;
}

export function ProductCard({ producto, empresaSlug, onClick, ocultarPrecios, rol }: ProductCardProps) {
  const [showPrenota, setShowPrenota] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // ponytail: /api/kardex y /api/productos/{codigo}/compradores dependen de
  // schemas WinFac inexistentes (§9.3.14, §9.3.15). Precio máx. venta muestra '—'.

  return (
    <>
    <div
      ref={cardRef}
      className="group relative bg-[var(--neutral-primary-soft)] border border-[var(--border)] rounded-card overflow-hidden cursor-pointer transition-all duration-200 hover:brightness-[1.03]"
      onClick={() => onClick(producto)}
    >
      <div className="flex flex-col p-3 gap-3">

        {/* Top row: imagen + código + descripción */}
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-20 h-20 rounded-md overflow-hidden bg-[var(--muted)] border border-[var(--border)]">
            <ImageWithFallback
              src={producto.imagen_url}
              codigo={producto.codigo}
              empresaSlug={empresaSlug}
              fill
              ancho={400}
            />
          </div>
          <div className="flex flex-col flex-1 min-w-0 gap-1">
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono text-[11px] font-semibold text-[var(--body)] px-1.5 py-0.5 bg-[var(--muted)] rounded-pill">
                {producto.codigo}
              </span>
              {producto.es_nuevo && (
                <Badge variant="success" className="text-[10px] px-1.5 py-0 h-4">
                  NUEVO
                </Badge>
              )}
            </div>
            <h3 className="text-sm font-medium leading-snug text-foreground line-clamp-3" title={producto.detalle || ''}>
              {producto.detalle || 'Sin descripción'}
            </h3>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Bottom row: precio + stock */}
        <div className="flex items-stretch gap-0">
          <div className="flex-1 flex flex-col justify-center">
            <div className="text-[10px] uppercase tracking-wide text-[var(--body-subtle)] font-medium mb-0.5">
              Precio por menor
            </div>
            <div className="text-xl font-semibold text-[var(--heading)] leading-none">
              {ocultarPrecios ? '••••' : producto.prcventa > 0 ? formatCLP(producto.prcventa) : '—'}
            </div>
            {(flags as Record<string, boolean>)['precio-mayorista-ui'] === true && !ocultarPrecios && producto.precio_mayor != null && (
              <div className="text-xs text-[var(--body)] mt-1">Por mayor: {formatCLP(producto.precio_mayor)}</div>
            )}
          </div>

          <div className="w-px bg-border flex-shrink-0 mx-3" />

          <div className="flex flex-col items-end justify-center gap-1">
            <div className="text-[10px] uppercase tracking-wide text-[var(--body-subtle)] font-medium text-right">Stock</div>
            <div className={`text-sm font-semibold text-right ${producto.saldo > 0 ? 'text-[var(--primary)]' : 'text-[var(--destructive)]'}`}>
              {Math.floor(producto.saldo / producto.cantcaja)} cj{producto.saldo % producto.cantcaja > 0 ? ` + ${producto.saldo % producto.cantcaja} ${producto.umed}` : ''}
            </div>
            <div className="text-[11px] text-[var(--body-subtle)] text-right leading-none">
              {producto.saldo} {producto.umed}
            </div>
            {producto.cantcaja > 1 && (
              <div className="text-[11px] text-[var(--body-subtle)] text-right leading-none">
                Packing: {producto.cantcaja} {producto.umed}/Caja
              </div>
            )}
          </div>
        </div>

        {/* ponytail: /api/productos/{codigo}/compradores no existe (§9.3.15). Oculto. */}

        {rol !== 'bodeguero' && (
          <button
            onClick={e => { e.stopPropagation(); setShowPrenota(true); }}
            className="w-full text-xs text-[var(--success)] font-medium flex items-center justify-center gap-1 pt-1 border-t border-[var(--border)] mt-1 hover:brightness-110"
          >
            <ClipboardList className="w-3 h-3" />
            Agregar a Nota de Venta
          </button>
        )}

      </div>
    </div>
    <AgregarANotaVentaModal
      open={showPrenota}
      onClose={() => setShowPrenota(false)}
      producto={producto}
    />
    </>
  );
}
