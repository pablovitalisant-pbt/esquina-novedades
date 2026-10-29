'use client';

import { Button } from '@/components/ui/button';
import { formatCLP } from '@/lib/utils';
import type { Modalidad } from '@/contexts/CarritoContext';
import flags from '@/config/feature-flags.json';

/**
 * Selector unidad/caja por producto. Caja solo se habilita con precio
 * mayorista > 0 y cantcaja > 0 (contrato Slice 7c). Muestra precio y stock.
 */
export function SelectorModalidad({
  modalidad,
  onChange,
  precioUnidad,
  precioMayor,
  cantcaja,
  stock,
  umed,
}: {
  modalidad: Modalidad;
  onChange: (modalidad: Modalidad) => void;
  precioUnidad: number | null;
  precioMayor: number | null;
  cantcaja: number;
  stock?: number;
  umed?: string;
}) {
  // Hotfix: tienda online sin venta por mayor mientras el flag esté apagado.
  const cajaHabilitada = flags['tienda-mayor-online'] === true;
  const cajaDisponible = cajaHabilitada && Number(precioMayor) > 0 && Number(cantcaja) > 0;

  return (
    <div role="group" aria-label="Modalidad de compra" className="flex flex-col gap-1.5">
      <div className={`grid ${cajaHabilitada ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
        <Button
          type="button"
          size="sm"
          variant={modalidad === 'unidad' ? 'default' : 'outline'}
          aria-pressed={modalidad === 'unidad'}
          onClick={() => onChange('unidad')}
          className="h-auto flex-col gap-0.5 py-2"
        >
          <span className="font-semibold">Unidad</span>
          <span className="text-xs">{precioUnidad != null ? formatCLP(precioUnidad) : 'Consultar'}</span>
        </Button>
        {cajaHabilitada && (
          <Button
            type="button"
            size="sm"
            variant={modalidad === 'caja' ? 'default' : 'outline'}
            aria-pressed={modalidad === 'caja'}
            disabled={!cajaDisponible}
            onClick={() => onChange('caja')}
            className="h-auto flex-col gap-0.5 py-2"
          >
            <span className="font-semibold">Caja</span>
            <span className="text-xs">
              {cajaDisponible ? formatCLP(Number(precioMayor)) : 'No disponible'}
            </span>
          </Button>
        )}
      </div>
      <div className="flex justify-between text-xs text-[var(--body-subtle)]">
        {typeof stock === 'number' && <span>Stock: {stock} unidades</span>}
        {cajaDisponible && (
          <span>
            Caja de {cantcaja} {umed ?? 'unidades'}
          </span>
        )}
      </div>
    </div>
  );
}
