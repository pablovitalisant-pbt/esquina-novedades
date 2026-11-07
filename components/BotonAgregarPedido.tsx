'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CarritoGateModal } from '@/components/CarritoGateModal';
import { useCarrito, ItemCarrito, ContactoCarrito } from '@/contexts/CarritoContext';

export type ProductoPedido = {
  producto_id: number;
  codigo: string;
  detalle: string | null;
  precio: number | null; // precio unidad (prcventa o precio de catálogo)
  precio_mayor?: number | null;
  minimo_mayor?: number | null;
};

// Override de cva vía twMerge: una columna, alto tocable y texto que envuelve.
const claseBoton = 'w-full min-w-0 whitespace-normal h-auto min-h-11 px-2 py-2 leading-snug';

/**
 * "Agregar al pedido": suma 1 unidad con precio detalle. El descuento por mayor
 * lo decide el servidor y se revela en el checkout. Sin contacto guardado abre
 * el gate y agrega recién tras confirmar nombre+teléfono+email.
 *
 * Con `modoExplicito` (flag `tienda-medios-compra`) ofrece dos botones:
 * detalle suma 1; mayor completa hasta `minimoMayorDisponible` y desde el
 * mínimo suma 1 más. La elección pendiente sobrevive al gate.
 */
export function BotonAgregarPedido({
  item,
  modoExplicito = false,
  minimoMayorDisponible = null,
  modalidadVisible,
}: {
  item: ProductoPedido;
  modoExplicito?: boolean;
  minimoMayorDisponible?: number | null;
  /** Si se indica, limita las acciones a esa modalidad. Omitida = ambas. */
  modalidadVisible?: 'detalle' | 'mayor';
}) {
  const { contacto, agregarItem, setContacto } = useCarrito();
  const [pendiente, setPendiente] = useState<{ item: ItemCarrito; minimo: number | null } | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const ofreceMayor = modoExplicito && minimoMayorDisponible != null && minimoMayorDisponible > 0;

  function itemCarrito(): ItemCarrito {
    return {
      producto_id: item.producto_id,
      codigo: item.codigo,
      detalle: item.detalle,
      cantidad: 1,
      precio: item.precio,
      precio_mayor: item.precio_mayor ?? null,
      minimo_mayor: item.minimo_mayor ?? null,
    };
  }

  function handleClick(minimo: number | null) {
    const nuevo = itemCarrito();
    if (contacto) {
      agregarItem(nuevo, minimo);
      return;
    }
    setPendiente({ item: nuevo, minimo });
    setGateOpen(true);
  }

  function handleConfirm(c: ContactoCarrito) {
    setContacto(c);
    if (pendiente) agregarItem(pendiente.item, pendiente.minimo);
    setPendiente(null);
    setGateOpen(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {modoExplicito ? (
        <div className="grid grid-cols-1 gap-2">
          {modalidadVisible !== 'mayor' && (
            <Button variant="secondary" className={claseBoton} onClick={() => handleClick(null)}>
              Comprar al detalle
            </Button>
          )}
          {ofreceMayor && modalidadVisible !== 'detalle' && (
            <Button variant="secondary" className={claseBoton} onClick={() => handleClick(minimoMayorDisponible ?? null)}>
              Comprar por mayor
            </Button>
          )}
        </div>
      ) : (
        <Button variant="secondary" className={claseBoton} onClick={() => handleClick(null)}>
          Agregar al pedido
        </Button>
      )}
      <CarritoGateModal open={gateOpen} onOpenChange={setGateOpen} onConfirm={handleConfirm} />
    </div>
  );
}
