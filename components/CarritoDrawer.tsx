'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ShoppingBag, Plus, Minus, Trash2 } from 'lucide-react';
import { useCarrito } from '@/contexts/CarritoContext';
import { formatCLP } from '@/lib/utils';

/**
 * Carrito: trigger flotante (solo visible con items) + Sheet lateral con el
 * resumen, edición de cantidades y "Enviar pedido". El envío hace POST a
 * /api/pedidos; ante error conserva los items del visitante.
 */
export function CarritoDrawer() {
  const { contacto, items, origen, origen_slug, totalItems, actualizarCantidad, quitarItem, limpiar } =
    useCarrito();
  const [open, setOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Total de la compra: Σ precio_referencia × cantcaja × cantidad (solo con precio)
  const total = items.reduce((acc, i) => {
    if (i.precio_referencia == null) return acc;
    return acc + i.precio_referencia * i.cantcaja * i.cantidad;
  }, 0);
  const haySinPrecio = items.some((i) => i.precio_referencia == null);

  async function enviarPedido() {
    // Guard contra doble envío: ignora si ya hay un envío en curso.
    if (!contacto || items.length === 0 || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre_contacto: contacto.nombre,
          telefono_contacto: contacto.telefono,
          origen,
          origen_slug,
          items: items.map((i) => ({
            producto_id: i.producto_id,
            codigo: i.codigo,
            detalle: i.detalle,
            cantidad: i.cantidad,
            precio_referencia: i.precio_referencia,
          })),
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        toast.success('Pedido enviado');
        limpiar(); // conserva el contacto para un próximo pedido
        setOpen(false);
      } else {
        toast.error(body?.error ?? 'No se pudo enviar el pedido');
        // items intactos ante error
      }
    } catch {
      toast.error('Error de red. Tu pedido se conservó.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      {totalItems > 0 && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-pill bg-[var(--primary)] text-white px-5 h-12 shadow-lg hover:opacity-90 transition-opacity"
          aria-label="Abrir carrito"
        >
          <ShoppingBag className="w-5 h-5" />
          <span className="font-bold">{totalItems}</span>
        </button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex flex-col">
          <SheetHeader>
            <SheetTitle>Tu pedido</SheetTitle>
            <SheetDescription>
              {contacto ? `${contacto.nombre} · ${contacto.telefono}` : 'Sin datos de contacto'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-3 py-4 flex-1 overflow-y-auto">
            {items.length === 0 && (
              <p className="text-sm text-[var(--body-subtle)] text-center py-10">Tu carrito está vacío.</p>
            )}
            {items.map((item) => {
              const precioPorCaja = item.precio_referencia != null ? item.precio_referencia * item.cantcaja : null;
              return (
                <div
                  key={item.producto_id}
                  className="flex items-start justify-between gap-3 border border-[var(--border-default)] rounded-xl p-3"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-[var(--body-subtle)]">{item.codigo}</div>
                    <div className="font-medium text-sm line-clamp-2">{item.detalle}</div>
                    {precioPorCaja != null && (
                      <div className="text-xs text-[var(--body-subtle)]">{formatCLP(precioPorCaja)} / caja</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => actualizarCantidad(item.producto_id, item.cantidad - 1)}
                        aria-label="Disminuir"
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <span className="w-6 text-center font-bold">{item.cantidad}</span>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => actualizarCantidad(item.producto_id, item.cantidad + 1)}
                        aria-label="Aumentar"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="text-[10px] text-[var(--body-subtle)] text-right leading-tight">
                      <div>{item.cantidad} caja{item.cantidad !== 1 ? 's' : ''}</div>
                      <div>= {item.cantidad * item.cantcaja} unidades</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => quitarItem(item.producto_id)}
                      aria-label="Quitar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-[var(--border-default)] pt-4 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-[var(--body-subtle)]">Total de la compra</span>
              <div className="text-right">
                <div className="text-lg font-bold">{formatCLP(total)}</div>
              </div>
            </div>
            {haySinPrecio && (
              <p className="text-xs text-[var(--body-subtle)]">algunos productos sin precio no incluidos</p>
            )}
            <Button
              className="w-full"
              disabled={enviando || items.length === 0}
              onClick={enviarPedido}
            >
              {enviando ? 'Enviando…' : 'Enviar pedido'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
