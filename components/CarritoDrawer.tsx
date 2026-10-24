'use client';

import { useEffect, useState } from 'react';
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
import { CarritoCheckoutForm, DatosCheckout, OpcionEntrega } from '@/components/CarritoCheckoutForm';
import { formatCLP } from '@/lib/utils';
import { redirigirA } from '@/lib/redirigir';

/**
 * Carrito: trigger flotante (solo visible con items) + Sheet lateral con el
 * resumen, edición de cantidades y checkout (contacto/entrega). El total
 * mostrado es estimado: el servidor lo recalcula en 7e. Al POST solo se envían
 * producto_id, modalidad y cantidad.
 */
export function CarritoDrawer() {
  const { contacto, items, origen, origen_slug, totalItems, actualizarCantidad, quitarItem, limpiar, setContacto } =
    useCarrito();
  const [open, setOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [opciones, setOpciones] = useState<OpcionEntrega[]>([]);
  const [checkout, setCheckout] = useState<DatosCheckout | null>(null);
  // Error visible dentro del carrito: un toast dura segundos y puede quedar tapado.
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  useEffect(() => {
    // Las opciones solo hacen falta al abrir el checkout.
    if (!open) return;
    let activo = true;
    fetch('/api/entrega/opciones')
      .then((res) => res.json())
      .then((body) => {
        if (activo && Array.isArray(body?.data)) setOpciones(body.data);
      })
      .catch(() => {
        // sin opciones no se puede enviar; no romper el carrito
      });
    return () => {
      activo = false;
    };
  }, [open]);

  // Total estimado: Σ precio de la modalidad × cantidad + costo de entrega.
  const subtotal = items.reduce((acc, i) => (i.precio == null ? acc : acc + i.precio * i.cantidad), 0);
  const costoEntrega = checkout?.opcion?.costo ?? 0;
  const total = subtotal + costoEntrega;
  const haySinPrecio = items.some((i) => i.precio == null);

  async function enviarPedido(datos: DatosCheckout) {
    // Guard contra doble envío: ignora si ya hay un envío en curso.
    if (items.length === 0 || enviando) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre_contacto: datos.nombre,
          telefono_contacto: datos.telefono,
          email_contacto: datos.email,
          origen,
          origen_slug,
          entrega_codigo: datos.entrega_codigo,
          direccion_entrega: datos.opcion?.requiere_direccion ? datos.direccion_entrega : null,
          items: items.map((i) => ({
            producto_id: i.producto_id,
            modalidad: i.modalidad,
            cantidad: i.cantidad,
          })),
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setContacto({ nombre: datos.nombre, telefono: datos.telefono, email: datos.email });
        limpiar(); // conserva el contacto para un próximo pedido
        setOpen(false);
        const initPoint = body?.data?.init_point;
        if (typeof initPoint === 'string' && initPoint) {
          redirigirA(initPoint); // Slice 9d: pago online habilitado
        } else {
          toast.success('Pedido enviado');
        }
      } else {
        setErrorEnvio(mensajeError(body));
        // items intactos ante error
      }
    } catch {
      setErrorEnvio('No pudimos conectarnos con la tienda. Revisa tu conexión e intenta de nuevo; tu pedido se conservó.');
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

          <div className="flex flex-col gap-3 px-4 py-4 flex-1 overflow-y-auto">
            {items.length === 0 && (
              <p className="text-sm text-[var(--body-subtle)] text-center py-10">Tu carrito está vacío.</p>
            )}
            {items.map((item) => {
              const subtotalItem = item.precio == null ? null : item.precio * item.cantidad;
              return (
                <div
                  key={`${item.producto_id}-${item.modalidad}`}
                  className="flex items-start justify-between gap-3 border border-[var(--border-default)] rounded-xl p-3"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-[var(--body-subtle)]">{item.codigo}</div>
                    <div className="font-medium text-sm line-clamp-2">{item.detalle}</div>
                    {item.precio != null && (
                      <div className="text-xs text-[var(--body-subtle)]">
                        {formatCLP(item.precio)} / {item.modalidad}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => actualizarCantidad(item.producto_id, item.cantidad - 1, item.modalidad)}
                        aria-label="Disminuir"
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <span className="w-6 text-center font-bold">{item.cantidad}</span>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => actualizarCantidad(item.producto_id, item.cantidad + 1, item.modalidad)}
                        aria-label="Aumentar"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="text-[10px] text-[var(--body-subtle)] text-right leading-tight">
                      <div>
                        {item.cantidad} {item.modalidad === 'caja' ? `caja${item.cantidad !== 1 ? 's' : ''}` : `unidad${item.cantidad !== 1 ? 'es' : ''}`}
                      </div>
                      {item.modalidad === 'caja' && <div>= {item.cantidad * item.cantcaja} unidades</div>}
                      {subtotalItem != null && <div className="font-bold text-[var(--heading)]">{formatCLP(subtotalItem)}</div>}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => quitarItem(item.producto_id, item.modalidad)}
                      aria-label="Quitar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}

            <CarritoCheckoutForm
              contacto={contacto}
              opciones={opciones}
              onCambio={setCheckout}
              onSubmit={enviarPedido}
            />
          </div>

          <div className="border-t border-[var(--border-default)] px-4 pt-4 pb-4 flex flex-col gap-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--body-subtle)]">Subtotal</span>
              <span data-testid="subtotal">{formatCLP(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--body-subtle)]">Costo de entrega</span>
              <span data-testid="costo-entrega">{formatCLP(costoEntrega)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-[var(--body-subtle)]">Total estimado</span>
              <div className="text-lg font-bold" data-testid="total-estimado">{formatCLP(total)}</div>
            </div>
            {errorEnvio && (
              <p
                role="alert"
                data-testid="error-envio"
                className="text-sm rounded-lg border border-red-300 bg-red-50 text-red-700 px-3 py-2"
              >
                {errorEnvio}
              </p>
            )}
            {haySinPrecio && (
              <p className="text-xs text-[var(--body-subtle)]">algunos productos sin precio no incluidos</p>
            )}
            <Button
              type="submit"
              form="checkout-form"
              className="w-full"
              disabled={enviando || items.length === 0}
            >
              {enviando ? 'Enviando…' : 'Enviar pedido'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Mensaje para el cliente a partir de la respuesta de error de POST /api/pedidos. */
type ErrorPedido = {
  items?: Array<{ codigo: string; disponible: number; solicitado: number }>;
  error?: string;
};

function mensajeError(body: ErrorPedido | null): string {
  const sinStock = Array.isArray(body?.items) ? body.items : [];
  if (sinStock.length > 0) {
    const detalle = sinStock
      .map((i) => `${i.codigo} (quedan ${i.disponible}, pediste ${i.solicitado})`)
      .join(', ');
    return `No hay stock suficiente: ${detalle}. Ajusta las cantidades e intenta de nuevo.`;
  }
  return typeof body?.error === 'string' && body.error
    ? body.error
    : 'No se pudo enviar el pedido. Intenta de nuevo en unos minutos.';
}
