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
  stock?: number;
  umed?: string;
};

/**
 * "Agregar al pedido": suma 1 unidad con precio detalle. El descuento por mayor
 * lo decide el servidor y se revela en el checkout. Sin contacto guardado abre
 * el gate y agrega recién tras confirmar nombre+teléfono+email.
 */
export function BotonAgregarPedido({ item }: { item: ProductoPedido }) {
  const { contacto, agregarItem, setContacto } = useCarrito();
  const [pendiente, setPendiente] = useState<ItemCarrito | null>(null);
  const [gateOpen, setGateOpen] = useState(false);

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

  function handleClick() {
    const nuevo = itemCarrito();
    if (contacto) {
      agregarItem(nuevo);
      return;
    }
    setPendiente(nuevo);
    setGateOpen(true);
  }

  function handleConfirm(c: ContactoCarrito) {
    setContacto(c);
    if (pendiente) agregarItem(pendiente);
    setPendiente(null);
    setGateOpen(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" className="w-full" onClick={handleClick}>
        Agregar al pedido
      </Button>
      <CarritoGateModal open={gateOpen} onOpenChange={setGateOpen} onConfirm={handleConfirm} />
    </div>
  );
}
