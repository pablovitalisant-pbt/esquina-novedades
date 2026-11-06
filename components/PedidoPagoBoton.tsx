'use client';

import { useRef, useState } from 'react';
import { redirigirA } from '@/lib/redirigir';

/** N02c: solo init_point http(s), incluidos hosts fake de pruebas. */
function urlValida(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

export function PedidoPagoBoton({ pedidoId }: { pedidoId: string }) {
  const enCurso = useRef(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  async function pagar() {
    if (enCurso.current) return;
    enCurso.current = true;
    setCargando(true);
    setError('');
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/pagar`, { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok || !urlValida(body?.init_point)) throw new Error('sin init_point');
      redirigirA(body.init_point);
    } catch {
      setError('No se pudo iniciar el pago. Intenta nuevamente.');
    } finally {
      enCurso.current = false;
      setCargando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={pagar}
        disabled={cargando}
        aria-busy={cargando}
        className="inline-flex h-12 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--primary)] px-6 text-base font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:opacity-60"
      >
        Pagar con Mercado Pago
      </button>
      {error && (
        <p role="alert" className="rounded-[24px] border border-[var(--border-danger-subtle)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--fg-danger-strong)]">
          {error}
        </p>
      )}
    </div>
  );
}
