'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CarritoGateModal } from '@/components/CarritoGateModal';
import { useCarrito, ItemCarrito, ContactoCarrito } from '@/contexts/CarritoContext';

/**
 * Botón por producto. Sin contacto guardado → abre el gate y agrega el
 * producto recién tras confirmar nombre+teléfono. Con contacto → agrega
 * directo. Garantiza que ningún item entre sin datos de contacto.
 */
export function BotonAgregarPedido({ item }: { item: ItemCarrito }) {
  const { contacto, agregarItem, setContacto } = useCarrito();
  const [pendiente, setPendiente] = useState<ItemCarrito | null>(null);
  const [gateOpen, setGateOpen] = useState(false);

  function handleClick() {
    if (contacto) {
      agregarItem(item);
      return;
    }
    setPendiente(item);
    setGateOpen(true);
  }

  function handleConfirm(c: ContactoCarrito) {
    setContacto(c);
    if (pendiente) agregarItem(pendiente);
    setPendiente(null);
    setGateOpen(false);
  }

  return (
    <>
      <Button variant="secondary" className="w-full" onClick={handleClick}>
        Agregar al pedido
      </Button>
      <CarritoGateModal open={gateOpen} onOpenChange={setGateOpen} onConfirm={handleConfirm} />
    </>
  );
}
