'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type CuentaCLP = { id: number; nombre: string; moneda?: string };
type Confirmacion = { cuenta_id: number; referencia?: string };
type Props = {
  pedidoId: string; monto: number; metodo: 'efectivo' | 'transferencia';
  confirmacion?: Confirmacion;
  onConfirmado?: (datos: { caja_movimiento_id: string }) => void;
};
const ERROR = 'No se pudo completar el cobro. Intenta nuevamente.';

export function ConfirmarCobroPedido({ pedidoId, monto, metodo, confirmacion, onConfirmado }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [cuentas, setCuentas] = useState<CuentaCLP[]>([]);
  const [cuentaId, setCuentaId] = useState(confirmacion?.cuenta_id ?? 0);
  const [referencia, setReferencia] = useState(confirmacion?.referencia ?? '');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const guard = useRef(false);
  const uid = useId();

  useEffect(() => {
    if (!abierto || confirmacion) return;
    let vigente = true;
    setError('');
    fetch('/api/caja/cuentas?activas=true')
      .then(res => res.json())
      .then(data => {
        if (!vigente) return;
        const lista: CuentaCLP[] = (data?.data ?? []).filter((c: CuentaCLP) => c.moneda === 'CLP');
        setCuentas(lista);
        setCuentaId(prev => (lista.some(c => c.id === prev) ? prev : lista[0]?.id ?? 0));
      })
      .catch(() => vigente && setError('No se pudieron cargar las cuentas de caja.'));
    return () => { vigente = false; };
  }, [abierto, confirmacion]);

  const registrar = async () => {
    if (guard.current) return;
    const cuenta = confirmacion?.cuenta_id ?? cuentaId;
    const ref = (confirmacion?.referencia ?? referencia).trim();
    if (!cuenta) { setError('Selecciona una cuenta de caja.'); return; }
    if (metodo === 'transferencia' && !ref) { setError('Ingresa la referencia de la transferencia.'); return; }
    guard.current = true;
    setCargando(true);
    setError('');
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/confirmar-pago`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuenta_id: cuenta, monto, ...(ref ? { referencia: ref } : {}) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.caja_movimiento_id) {
        setError(typeof data?.error === 'string' ? data.error : ERROR);
        return;
      }
      onConfirmado?.({ caja_movimiento_id: data.caja_movimiento_id });
    } catch { setError(ERROR); }
    finally { guard.current = false; setCargando(false); }
  };

  if (!abierto) return <Button variant="brand" onClick={() => setAbierto(true)}>Confirmar cobro</Button>;

  return (
    <section className="flex flex-col gap-4 rounded-card border border-[var(--border)] bg-[var(--card)] p-4">
      <div>
        <p className="text-sm font-medium text-[var(--heading)]">Monto (CLP)</p>
        <p className="text-lg font-bold text-[var(--heading)]">${monto.toLocaleString('es-CL')}</p>
      </div>
      {!confirmacion && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${uid}-cuenta`} className="text-sm font-medium text-[var(--heading)]">Cuenta de caja</label>
          <select id={`${uid}-cuenta`} value={cuentaId} onChange={e => setCuentaId(Number(e.target.value))} disabled={cargando}
            className="w-full rounded-pill border border-[var(--border)] bg-[var(--neutral-primary-soft)] px-4 py-2 text-sm text-[var(--heading)]">
            {cuentas.length === 0 ? <option value={0}>Sin cuentas CLP activas</option>
              : cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      )}
      {!confirmacion && metodo === 'transferencia' && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${uid}-referencia`} className="text-sm font-medium text-[var(--heading)]">
            Referencia de transferencia
          </label>
          <Input id={`${uid}-referencia`} value={referencia} maxLength={128} disabled={cargando}
            onChange={e => setReferencia(e.target.value)} placeholder="N° de operación" />
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-card border border-[var(--border-danger-subtle)] bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--destructive)]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="success" onClick={registrar} disabled={cargando}>
          {cargando ? 'Registrando…' : 'Registrar cobro'}
        </Button>
        <Button variant="outline" onClick={() => setAbierto(false)} disabled={cargando}>Cancelar</Button>
      </div>
    </section>
  );
}
