"use client";

import { useEffect, useState, type RefObject } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/utils";

type Item = { codigo?: string; descripcion?: string; modalidad?: string; unidades?: number; precio?: number; subtotal?: number };
type Detalle = {
  fecha?: string; created_at?: string; cliente_nombre?: string; nombre_cliente?: string;
  cliente_telefono?: string; cliente_direccion?: string;
  items: Item[]; total: number; total_pagado: number; saldo_favor_aplicado: number; saldo_pendiente: number;
};

export function CajaDetalleNotaDialog({ notaId, open, onOpenChange, finalFocus }: {
  notaId: number | null; open: boolean; onOpenChange: (o: boolean) => void;
  /** Trigger al que vuelve el foco al cerrar (Escape o botón). */
  finalFocus?: RefObject<HTMLElement | null>;
}) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [estado, setEstado] = useState<"carga" | "error" | "ausente" | "listo">("carga");

  useEffect(() => {
    if (!open || notaId == null) { setDetalle(null); setEstado("carga"); return; }
    const ctrl = new AbortController();
    setDetalle(null);
    setEstado("carga");
    fetch(`/api/notas-venta/${notaId}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (res.status === 404) { if (!ctrl.signal.aborted) setEstado("ausente"); return; }
        if (!res.ok) throw new Error("No se pudo cargar");
        const data = await res.json();
        if (!ctrl.signal.aborted) { setDetalle(data); setEstado("listo"); }
      })
      .catch(() => { if (!ctrl.signal.aborted) setEstado("error"); });
    return () => ctrl.abort(); // respuesta obsoleta al cerrar o cambiar de nota
  }, [notaId, open]);

  const cliente = detalle?.cliente_nombre || detalle?.nombre_cliente;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto" finalFocus={finalFocus}>
        <DialogHeader><DialogTitle>Nota de venta #{notaId}</DialogTitle></DialogHeader>
        {estado === "carga" && <p className="text-sm text-[var(--body-subtle)]">Cargando…</p>}
        {estado === "error" && <p className="text-sm text-[var(--destructive)]">No se pudo cargar la nota.</p>}
        {estado === "ausente" && <p className="text-sm text-[var(--destructive)]">Nota no encontrada.</p>}
        {estado === "listo" && detalle && (
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-bold">{cliente || "Sin cliente"}</p>
              <p className="text-xs text-[var(--body-subtle)]">
                {detalle.cliente_telefono || "Sin teléfono"} · {detalle.fecha || detalle.created_at}
              </p>
              {detalle.cliente_direccion && (
                <p className="text-xs text-[var(--body-subtle)]">{detalle.cliente_direccion}</p>
              )}
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {detalle.items.map((i, n) => (
                <li key={n} className="py-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium break-words">{i.descripcion || i.codigo}</span>
                    <span className="font-bold whitespace-nowrap">{formatCLP(Number(i.subtotal ?? 0))}</span>
                  </div>
                  <p className="text-xs text-[var(--body-subtle)]">
                    {i.codigo} · por {i.modalidad === "mayor" ? "mayor" : "menor"} · {Number(i.unidades)} × {formatCLP(Number(i.precio ?? 0))}
                  </p>
                </li>
              ))}
            </ul>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-[var(--border)] pt-2">
              <dt>Total</dt><dd className="text-right font-bold">{formatCLP(detalle.total)}</dd>
              <dt>Pagado</dt><dd className="text-right">{formatCLP(detalle.total_pagado)}</dd>
              <dt>Saldo a favor aplicado</dt><dd className="text-right">{formatCLP(detalle.saldo_favor_aplicado)}</dd>
              <dt>Pendiente</dt><dd className="text-right font-bold">{formatCLP(detalle.saldo_pendiente)}</dd>
            </dl>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
