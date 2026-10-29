'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CarritoGateModal } from '@/components/CarritoGateModal';
import { SelectorModalidad } from '@/components/SelectorModalidad';
import { useCarrito, ItemCarrito, ContactoCarrito, Modalidad } from '@/contexts/CarritoContext';
import flags from '@/config/feature-flags.json';

export type ProductoPedido = {
  producto_id: number;
  codigo: string;
  detalle: string | null;
  precio: number | null; // precio unidad mostrado (prcventa o precio de catálogo)
  precio_mayor?: number | null;
  cantcaja: number;
  stock?: number;
  umed?: string;
  modalidad?: Modalidad; // modalidad inicial
};

/**
 * Por producto: selector unidad/caja + "Agregar al pedido". La caja solo se
 * puede elegir si hay precio mayorista y cantcaja > 0. Sin contacto guardado
 * abre el gate y agrega recién tras confirmar nombre+teléfono.
 */
export function BotonAgregarPedido({ item }: { item: ProductoPedido }) {
  const { contacto, agregarItem, setContacto } = useCarrito();
  // Hotfix: con el flag apagado la tienda solo vende por unidad.
  const cajaHabilitada = flags['tienda-mayor-online'] === true;
  const [modalidad, setModalidad] = useState<Modalidad>(
    cajaHabilitada ? item.modalidad ?? 'unidad' : 'unidad',
  );
  const [pendiente, setPendiente] = useState<ItemCarrito | null>(null);
  const [gateOpen, setGateOpen] = useState(false);

  function itemCarrito(): ItemCarrito {
    const esCaja = cajaHabilitada && modalidad === 'caja'
      && Number(item.precio_mayor) > 0 && Number(item.cantcaja) > 0;
    const precio = esCaja ? Number(item.precio_mayor) : item.precio;
    return {
      producto_id: item.producto_id,
      codigo: item.codigo,
      detalle: item.detalle,
      cantidad: 1,
      modalidad: esCaja ? 'caja' : 'unidad',
      precio,
      // legacy hasta 7d: el drawer multiplica por cantcaja para mostrar el precio de caja.
      precio_referencia: esCaja ? Number(item.precio_mayor) / Number(item.cantcaja) : item.precio,
      cantcaja: item.cantcaja,
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
      <SelectorModalidad
        modalidad={modalidad}
        onChange={setModalidad}
        precioUnidad={item.precio}
        precioMayor={item.precio_mayor ?? null}
        cantcaja={item.cantcaja}
        stock={item.stock}
        umed={item.umed}
      />
      <Button variant="secondary" className="w-full" onClick={handleClick}>
        Agregar al pedido
      </Button>
      <CarritoGateModal open={gateOpen} onOpenChange={setGateOpen} onConfirm={handleConfirm} />
    </div>
  );
}
