'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCLP } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface Props {
  notaId: string | number;
  saldoPendiente: number;
  saldoDisponible: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// Slice 3b — Aplicar saldo a favor de un cliente a una nota. No hay cuenta,
// moneda ni forma de pago: el saldo ya está en el ledger (crédito de 3a) y
// aquí solo se convierte en un débito que descuenta la deuda de la nota.
export function AplicarSaldoFavorDialog({
  notaId,
  saldoPendiente,
  saldoDisponible,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [monto, setMonto] = useState(0);
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMonto(Math.min(saldoPendiente, saldoDisponible));
    setObservaciones('');
    setLoading(false);
  }, [open, saldoPendiente, saldoDisponible]);

  const aplicar = async () => {
    if (monto <= 0) { toast.error('El monto debe ser mayor a 0'); return; }
    if (monto > saldoPendiente + 0.005) {
      toast.error(`El monto excede el saldo pendiente de ${formatCLP(saldoPendiente)}`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/notas-venta/${notaId}/aplicar-saldo-favor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto, observaciones }),
      });
      if (res.ok) {
        toast.success('Saldo a favor aplicado correctamente');
        onOpenChange(false);
        onSuccess();
      } else {
        const err = await res.json();
        toast.error(typeof err.error === 'string' ? err.error : 'Error al aplicar saldo a favor');
      }
    } catch {
      toast.error('Error al aplicar el saldo a favor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aplicar saldo a favor</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <p className="text-sm text-[var(--body)]">
            Saldo a favor disponible: <strong className="text-[var(--heading)]">{formatCLP(saldoDisponible)}</strong>
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--body)]">Monto a aplicar</label>
            <Input
              type="number"
              step={0.01}
              min={0}
              value={monto}
              onChange={e => setMonto(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--body)]">Observaciones</label>
            <Input
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
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
            onClick={aplicar}
            disabled={loading}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {loading ? 'Aplicando...' : 'Aplicar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
