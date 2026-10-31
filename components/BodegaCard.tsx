'use client';

import { UbicacionBodegaAgrupada } from '@/types';
import { ImageWithFallback } from './ImageWithFallback';

interface BodegaCardProps {
  ubicacion: UbicacionBodegaAgrupada;
  empresaSlug: string;
  onClick: (ubicacion: UbicacionBodegaAgrupada) => void;
}

export function BodegaCard({ ubicacion, onClick }: BodegaCardProps) {
  const { saldo, fisico, diferencia, cantcaja, umed } = ubicacion;

  const difColor = diferencia === null
    ? 'text-[var(--body-subtle)] dark:text-[var(--body)]'
    : diferencia === 0
      ? 'saldo-zero'
      : diferencia < 0
        ? 'saldo-negative'
        : 'saldo-surplus';

  const difLabel = diferencia === null
    ? '—'
    : diferencia > 0
      ? `+${diferencia} ${umed}`
      : diferencia < 0
        ? `${diferencia} ${umed}`
        : `${diferencia} ${umed}`;

  return (
    <div
      className="group relative bg-card hover:bg-[var(--muted)] dark:hover:bg-[var(--muted)] border border-border shadow-sm rounded-card overflow-hidden cursor-pointer transition-all hover:shadow-md active:scale-[0.98]"
      onClick={() => onClick(ubicacion)}
    >
      {/* Top: foto + código + descripción + packing */}
      <div className="flex gap-3 p-3 pb-2">
        <div className="flex-shrink-0 w-16 h-16 rounded-md overflow-hidden bg-[var(--muted)] dark:bg-[var(--muted)] border border-border self-center">
          <ImageWithFallback
            src={ubicacion.producto_imagen_url}
            codigo={ubicacion.codigo}
            fill
            ancho={400}
          />
        </div>
        <div className="flex flex-col flex-1 min-w-0 gap-0.5">
          <div className="font-mono text-[11px] font-semibold text-[var(--body)] dark:text-[var(--body-subtle)]">
            {ubicacion.codigo}
          </div>
          <div className="text-xs font-medium text-foreground leading-snug line-clamp-2" title={ubicacion.detalle || ''}>
            {ubicacion.detalle || 'Sin descripción'}
          </div>
          {cantcaja > 1 && (
            <div className="text-[10px] text-[var(--body-subtle)] dark:text-[var(--body)] mt-0.5">
              Packing: {cantcaja} {umed}/Caja
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Stats: Sistema / Físico / Diferencia */}
      <div className="grid grid-cols-3 divide-x divide-border">
        <div className="flex flex-col gap-0.5 px-3 py-2">
          <div className="stat-label">Sistema</div>
          <div className="text-sm leading-none saldo-positive">
            {saldo} {umed}
          </div>
          <div className="text-[10px] text-[var(--body-subtle)] leading-none">
            {Math.floor(saldo / cantcaja)} cj{saldo % cantcaja > 0 ? ` + ${saldo % cantcaja}` : ''}
          </div>
        </div>
        <div className="flex flex-col gap-0.5 px-3 py-2">
          <div className="stat-label">Bodega</div>
          <div className={`text-sm leading-none ${fisico !== null ? 'saldo-zero' : 'text-[var(--body-subtle)]'}`}>
            {fisico !== null ? `${fisico} ${umed}` : '—'}
          </div>
        </div>
        <div className="flex flex-col gap-0.5 px-3 py-2">
          <div className="stat-label">Diferencia</div>
          <div className={`text-sm font-semibold leading-none ${difColor}`}>
            {difLabel}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Ubicación */}
      <div className="px-3 py-2">
        <div className="stat-label mb-1.5">Ubicación en bodega</div>
        {ubicacion.ubicacion ? (
          <span className="inline-block font-mono text-2xl font-bold bg-[var(--primary)] dark:bg-[var(--primary)]/40 text-[var(--primary)] dark:text-[var(--primary)] px-3 py-1.5 rounded-lg">
            {ubicacion.ubicacion}
          </span>
        ) : (
          <span className="text-[11px] text-[var(--body-subtle)] italic">Sin ubicación registrada</span>
        )}
      </div>
    </div>
  );
}
