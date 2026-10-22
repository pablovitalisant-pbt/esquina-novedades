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
import type { Cuenta } from '@/types';

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
  const [dolarDia, setDolarDia] = useState(0);
  const [pagoForm, setPagoForm] = useState({
    cuenta_id: 0,
    moneda: 'USD' as 'USD' | 'ARS',
    monto: 0,
    forma_pago: 'efectivo' as 'efectivo' | 'cheque' | 'transferencia',
    observaciones: '',
  });
  const [pagoLoading, setPagoLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setCuentasLoading(true);
      try {
        const [cuentasRes, configRes] = await Promise.all([
          fetch('/api/caja/cuentas?activas=true'),
          fetch('/api/caja/config'),
        ]);
        const cuentasData = await cuentasRes.json();
        const configData = await configRes.json();
        const lista = cuentasData.data || [];
        const dolar = parseFloat(configData.data?.valor || '0');
        setCuentas(lista);
        setDolarDia(dolar);
        if (lista.length > 0) {
          const primera = lista[0];
          const defaultMonto = primera.moneda === 'USD'
            ? saldoPendiente
            : Math.floor(saldoPendiente * dolar);
          setPagoForm({
            cuenta_id: primera.id,
            moneda: primera.moneda,
            monto: defaultMonto,
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
    const cuenta = cuentas.find(c => c.id === cuentaId);
    if (!cuenta) return;
    const defaultMonto = cuenta.moneda === 'USD'
      ? saldoPendiente
      : Math.floor(saldoPendiente * dolarDia);
    setPagoForm(prev => ({ ...prev, cuenta_id: cuenta.id, moneda: cuenta.moneda, monto: defaultMonto }));
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
                    {c.nombre} ({c.moneda})
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--body)]">
              Monto ({pagoForm.moneda})
            </label>
            <Input
              type="number"
              step={pagoForm.moneda === 'ARS' ? 1 : 0.01}
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
              onChange={e => setPagoForm(prev => ({ ...prev, forma_pago: e.target.value as any }))}
            >
              <option value="efectivo">Efectivo</option>
              <option value="cheque">Cheque</option>
              <option value="transferencia">Transferencia</option>
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
