'use client';

import { useRef, useState } from 'react';
import type { DatosTransferencia } from '@/lib/pedidos/datos-transferencia';
import { PedidoPagoBoton } from '@/components/PedidoPagoBoton';

type Metodo = 'transferencia' | 'efectivo';
interface Props {
  pedidoId: string; referencia: string; permiteEfectivo: boolean; permiteTransferencia: boolean;
  metodoInicial?: Metodo | null; datosIniciales?: DatosTransferencia | null;
}

const BOTON =
  'inline-flex h-12 items-center justify-center rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--neutral-primary-soft)] px-6 text-base font-medium text-[var(--body)] transition-colors hover:bg-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60';
const CAJA = 'rounded-[var(--radius-overlay)] border p-4 text-sm';

const pares = (d: DatosTransferencia, ref: string): [string, string][] => [
  ['Titular', d.titular], ['RUT', d.rut], ['Banco', d.banco],
  ['Tipo de cuenta', d.tipo_cuenta], ['Número de cuenta', d.numero_cuenta],
  ...(d.correo ? [['Correo', d.correo] as [string, string]] : []), ['Referencia', ref],
];

export function PedidoMediosPago({
  pedidoId, referencia, permiteEfectivo, permiteTransferencia,
  metodoInicial = null, datosIniciales = null,
}: Props) {
  const enCurso = useRef(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [metodo, setMetodo] = useState<Metodo | null>(metodoInicial);
  const [datos, setDatos] = useState<DatosTransferencia | null>(datosIniciales);

  async function elegir(siguiente: Metodo) {
    if (enCurso.current) return;
    enCurso.current = true;
    setCargando(true);
    setError('');
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/metodo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metodo: siguiente }),
      });
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error('metodo');
      setMetodo(siguiente);
      setDatos(cuerpo?.datos_transferencia ?? null);
    } catch {
      setError('No se pudo elegir el medio de pago. Intenta nuevamente.');
    } finally {
      enCurso.current = false;
      setCargando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {metodo === 'efectivo' && <p role="status" className={`${CAJA} border-[var(--border-success-subtle)] bg-[var(--success-soft)] text-[var(--fg-success-strong)]`}>Elegiste pagar en efectivo. Se paga al recibir el pedido.</p>}
      {metodo === 'transferencia' && (datos ? (
        <div className={`${CAJA} border-[var(--border-default)] bg-[var(--card)]`}>
          <h3 className="text-base font-medium text-[var(--heading)]">Datos para transferir</h3>
          <dl className="mt-3 grid gap-2">
            {pares(datos, referencia).map(([etiqueta, valor]) => (
              <div key={etiqueta} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <dt className="text-[var(--muted-foreground)]">{etiqueta}</dt>
                <dd className="text-right font-medium break-all text-[var(--body)]">{valor}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[var(--body-subtle)]">Transfiere e incluye la referencia para confirmar tu pago.</p>
        </div>
      ) : (
        <p className={`${CAJA} border-[var(--border-brand-subtle)] bg-[var(--brand-soft)] text-[var(--fg-brand-strong)]`}>
          Transferencia seleccionada.
        </p>
      ))}
      {!metodo && (
        <>
          <PedidoPagoBoton pedidoId={pedidoId} />
          {permiteTransferencia && <button type="button" onClick={() => elegir('transferencia')} disabled={cargando} aria-busy={cargando} className={BOTON}>Transferir</button>}
          {permiteEfectivo && <button type="button" onClick={() => elegir('efectivo')} disabled={cargando} aria-busy={cargando} className={BOTON}>Pagar en efectivo</button>}
        </>
      )}
      {error && <p role="alert" className={`${CAJA} border-[var(--border-danger-subtle)] bg-[var(--danger-soft)] text-[var(--fg-danger-strong)]`}>{error}</p>}
    </div>
  );
}
