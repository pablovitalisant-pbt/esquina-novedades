'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { Cuenta, FormaPago } from '@/types';

interface Props {
  notaId: string | number;
  saldoPendiente: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function PagarNotaDialog({ notaId, saldoPendiente, open, onOpenChange, onSuccess }: Props) {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cuentasLoading, setCuentasLoading] = useState(false);
  const [pagoForm, setPagoForm] = useState({
    cuenta_id: 0,
    monto: 0,
    forma_pago: 'efectivo' as FormaPago,
    observaciones: '',
  });
  const [pagoLoading, setPagoLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setCuentasLoading(true);
      try {
        const cuentasRes = await fetch('/api/caja/cuentas?activas=true');
        const cuentasData = await cuentasRes.json();
        const lista = cuentasData.data || [];
        setCuentas(lista);
        if (lista.length > 0) {
          setPagoForm({
            cuenta_id: lista[0].id,
            monto: Math.round(saldoPendiente),
            forma_pago: 'efectivo',
            observaciones: '',
          });
        }
      } catch {
        toast.error('Error al cargar datos de pago');
      } finally {
        setCuentasLoading(false);
      }
    })();
  }, [open, notaId, saldoPendiente]);

  const cambiarCuenta = (cuentaId: number) => {
    if (!cuentas.some(c => c.id === cuentaId)) return;
    setPagoForm(prev => ({ ...prev, cuenta_id: cuentaId }));
  };

  const confirmarPago = async () => {
    if (pagoForm.cuenta_id === 0) { toast.error('Selecciona una cuenta'); return; }
    if (pagoForm.monto <= 0) { toast.error('El monto debe ser mayor a 0'); return; }
    setPagoLoading(true);
    try {
      const res = await fetch(`/api/notas-venta/${notaId}/pagar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pagoForm),
      });
      if (res.ok) {
        toast.success('Pago registrado correctamente');
        onOpenChange(false);
        onSuccess();
      } else {
        const err = await res.json();
        toast.error(typeof err.error === 'string' ? err.error : 'Error al registrar pago');
      }
    } catch {
      toast.error('Error al procesar el pago');
    } finally {
      setPagoLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--body)]">Cuenta</label>
            <select
              className="border rounded-card px-3 py-2 text-sm bg-[var(--card)]"
              value={pagoForm.cuenta_id}
              onChange={e => cambiarCuenta(Number(e.target.value))}
              disabled={cuentasLoading || cuentas.length === 0}
            >
              {cuentasLoading ? (
                <option>Cargando cuentas...</option>
              ) : cuentas.length === 0 ? (
                <option>No hay cuentas disponibles</option>
              ) : (
                cuentas.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--body)]">Monto (CLP)</label>
            <Input
              type="number"
              step={1}
              min={0}
              value={pagoForm.monto}
              onChange={e => setPagoForm(prev => ({ ...prev, monto: Number(e.target.value) }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--body)]">Forma de pago</label>
            <select
              className="border rounded-card px-3 py-2 text-sm bg-[var(--card)]"
              value={pagoForm.forma_pago}
              onChange={e => setPagoForm(prev => ({ ...prev, forma_pago: e.target.value as FormaPago }))}
            >
              <option value="efectivo">Efectivo</option>
              <option value="cheque">Cheque</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--body)]">Observaciones</label>
            <Input
              value={pagoForm.observaciones}
              onChange={e => setPagoForm(prev => ({ ...prev, observaciones: e.target.value }))}
              placeholder="Opcional"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="success"
            onClick={confirmarPago}
            disabled={pagoLoading}
          >
            {pagoLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {pagoLoading ? 'Procesando...' : 'Confirmar pago'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
