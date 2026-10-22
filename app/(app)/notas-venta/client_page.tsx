'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import flags from '@/config/feature-flags.json';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, PlusCircle, Trash2, ExternalLink, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { PagarNotaDialog } from '@/components/PagarNotaDialog';
import { formatArsEquivalente, formatSaldoPendiente } from '@/lib/utils';

type Prenota = {
  id: number;
  titulo: string;
  created_at: string;
  nombre_cliente: string | null;
  tipo_documento: string | null;
  total?: number;
  total_pagado?: number;
  saldo_pendiente?: number;
  estado?: string;
};

export function PrenotasPage({ session }: { session: any }) {
  const router = useRouter();
  const rol = (session?.user as any)?.rol;
  const PREFETCH_HOVER = flags['notas-venta-prefetch-hover'] === true;

  const [prenotas, setPrenotas] = useState<Prenota[]>([]);
  const [loading, setLoading] = useState(true);
  const [dolarDia, setDolarDia] = useState(0);
  const [creating, setCreating] = useState(false);
  const [pagarNotaId, setPagarNotaId] = useState<number | null>(null);

  const fetchPrenotas = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const res = await fetch('/api/notas-venta');
      if (res.ok) {
        const { data } = await res.json();
        const sorted = (data || []).sort((a: Prenota, b: Prenota) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setPrenotas(sorted);
      } else {
        toast.error('Error cargando notas de venta');
      }
    } catch {
      toast.error('Error cargando nota de ventas');
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrenotas();
  }, []);

  // Prefetch on-hover (flag `notas-venta-prefetch-hover`): Next trae el payload
  // RSC de la nota recién cuando el puntero se sostiene ~150ms sobre la fila.
  // Reemplaza al loop que prefetcheaba TODAS las notas al montar (commit
  // 1f75a9a), que costaba una invocación de función + middleware por nota en
  // cada visita a la lista. El dedupe evita repetir la request en la sesión.
  const prefetched = useRef<Set<number>>(new Set());
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHoverPrefetch = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  const prefetchNota = (id: number) => {
    if (prefetched.current.has(id)) return;
    prefetched.current.add(id);
    router.prefetch(`/notas-venta/${id}`);
  };

  const handleHoverStart = (id: number) => {
    if (!PREFETCH_HOVER) return;
    cancelHoverPrefetch();
    hoverTimer.current = setTimeout(() => prefetchNota(id), 150);
  };

  useEffect(() => cancelHoverPrefetch, []);

  // Tipo de cambio para mostrar equivalentes en ARS (patrón PagarNotaDialog).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/caja/config');
        const data = await res.json();
        setDolarDia(parseFloat(data?.data?.valor || '0'));
      } catch {
        setDolarDia(0);
      }
    })();
  }, []);

  const handleCrear = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/notas-venta', { method: 'POST' });
      if (!res.ok) {
        toast.error('No se pudo crear la nota de venta');
        return;
      }
      const data = await res.json();

      router.push(`/notas-venta/${data.id}`);
    } catch {
      toast.error('No se pudo crear la nota de venta');
    } finally {
      setCreating(false);
    }
  };

  const handleEliminar = async (id: number) => {
    if (!confirm('¿Anular esta nota de venta?')) return;
    try {
      const res = await fetch(`/api/notas-venta/${id}`, { method: 'DELETE' });
      if (res.status === 409) {
        const body = await res.json();
        toast.error(body.mensaje, {
          action: { label: 'Ir a reembolsar', onClick: () => router.push(`/notas-venta/${id}`) },
          duration: 8000,
        });
        return;
      }
      if (!res.ok) {
        toast.error('No se pudo anular');
        return;
      }
      setPrenotas(prev => prev.filter(p => p.id !== id));
      toast.success('Nota anulada');
    } catch {
      toast.error('No se pudo anular');
    }
  };

  const formatFecha = (value: string) =>
    new Date(value).toLocaleDateString('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  return (
    <div className="flex flex-col gap-6 fade-in zoom-in-95 duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Notas de Venta</h1>
          <p className="text-[var(--body)] mt-1">Borradores de venta para preparar cotizaciones y seguimiento</p>
        </div>
        <Button variant="brand" onClick={handleCrear} disabled={creating}>
          <PlusCircle className="w-5 h-5 mr-2" />
          {creating ? 'Creando...' : 'Nueva Nota de Venta'}
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-[var(--muted)] rounded-card" />
          ))}
        </div>
      ) : prenotas.length === 0 ? (
        <div className="border rounded-card p-8 bg-[var(--card)] shadow-sm text-center text-[var(--body-subtle)]">
          No hay notas de venta
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-12">
          {prenotas.map(prenota => (
            <div
              key={prenota.id}
              data-testid={`nota-row-${prenota.id}`}
              onMouseEnter={() => handleHoverStart(prenota.id)}
              onMouseLeave={cancelHoverPrefetch}
              // Sin hover en mobile: el touch prefetchea directo, sin debounce.
              onTouchStart={() => { if (PREFETCH_HOVER) prefetchNota(prenota.id); }}
              className="bg-[var(--card)] border rounded-card p-4 shadow-sm flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--primary)] flex-shrink-0" />
                  <p className="font-bold text-base truncate">{prenota.titulo}</p>
                  {prenota.tipo_documento && (
                    <Badge variant="secondary" className="text-[10px]">
                      {prenota.tipo_documento}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-[var(--body-subtle)] mt-1">{formatFecha(prenota.created_at)}</p>
                {prenota.nombre_cliente && (
                  <p className="text-sm text-[var(--body)] mt-2">{prenota.nombre_cliente}</p>
                )}
                {prenota.total !== undefined && (
                  <>
                    <p className="text-sm font-semibold text-[var(--heading)] mt-1">
                      Total: ${prenota.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    {formatArsEquivalente(prenota.total, dolarDia) && (
                      <p className="text-xs text-[var(--body-subtle)]">
                        {formatArsEquivalente(prenota.total, dolarDia)}
                      </p>
                    )}
                    {formatSaldoPendiente(prenota.total_pagado, prenota.saldo_pendiente) && (
                      <p className="text-sm font-semibold text-[var(--destructive)] mt-0.5">
                        Pendiente: ${formatSaldoPendiente(prenota.total_pagado, prenota.saldo_pendiente)}
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                {prenota.saldo_pendiente != null && prenota.saldo_pendiente > 0.005 && prenota.estado !== 'anulada' && (
                  <Button
                    size="sm"
                    variant="success"
                    className="text-xs"
                    onClick={() => setPagarNotaId(prenota.id)}
                  >
                    <DollarSign className="w-3 h-3 mr-1" /> Pagar
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => router.push(`/notas-venta/${prenota.id}`)}
                >
                  <ExternalLink className="w-3 h-3 mr-1" /> Abrir
                </Button>
                {rol === 'admin' && (
                  <Button
                    variant="destructive" size="sm"
                    onClick={() => handleEliminar(prenota.id)}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Anular
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {pagarNotaId != null && (
        <PagarNotaDialog
          notaId={pagarNotaId}
          saldoPendiente={prenotas.find(n => n.id === pagarNotaId)?.saldo_pendiente ?? 0}
          open={pagarNotaId != null}
          onOpenChange={(open) => { if (!open) setPagarNotaId(null); }}
          onSuccess={() => { setPagarNotaId(null); fetchPrenotas(false); }}
        />
      )}
    </div>
  );
}
