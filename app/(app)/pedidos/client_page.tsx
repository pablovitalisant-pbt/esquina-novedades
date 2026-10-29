'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCLP } from '@/lib/utils';
import type { SessionProp } from '@/types';

interface PedidoItem {
  codigo: string;
  detalle: string | null;
  cantidad: number;
  modalidad: string;
  precio: number;
  subtotal: number | null;
}

interface Pedido {
  id: string;
  cliente: { id: string | null; nombre: string | null; telefono: string | null };
  email_contacto: string | null;
  origen: string;
  estado: string;
  entrega_codigo: string | null;
  entrega_costo: number;
  direccion_entrega: string | null;
  total: number;
  created_at: string;
  mp_payment_id?: string | null;
  mp_fecha_pago?: string | null;
  mp_revision_motivo?: string | null;
  items: PedidoItem[];
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  pendiente_pago: 'Pendiente de pago',
  pagado: 'Pagado',
  pagado_tardio: 'Pagado tarde',
  revision: 'En revisión',
  convertido: 'Convertido',
  descartado: 'Descartado',
  expirado: 'Expirado',
  rechazado: 'Rechazado',
};

const ENTREGA_LABEL: Record<string, string> = {
  retiro: 'Retiro en tienda',
  delivery_iquique: 'Delivery Iquique',
  delivery_alto_hospicio: 'Delivery Alto Hospicio',
  envio_arica: 'Envío a Arica',
};

function badgeClass(estado: string): string {
  if (estado === 'convertido' || estado === 'pagado') return 'bg-[var(--success-soft)] text-[var(--success)]';
  if (estado === 'descartado' || estado === 'expirado' || estado === 'rechazado') {
    return 'bg-[var(--muted)] text-[var(--body-subtle)]';
  }
  return 'bg-[var(--warning-soft)] text-[var(--warning)]';
}

function etiquetaCantidad(it: PedidoItem): string {
  const base = `${it.cantidad} unidad${it.cantidad !== 1 ? 'es' : ''}`;
  return it.modalidad === 'mayor' ? `${base} (por mayor)` : base;
}

function formatFecha(value: string): string {
  return new Date(value).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function PedidosPage({}: { session: SessionProp }) {
  const router = useRouter();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [convirtiendo, setConvirtiendo] = useState<string | null>(null);
  const [soloRevision, setSoloRevision] = useState(false);
  const visibles = soloRevision
    ? pedidos.filter((p) => p.estado === 'revision' || p.estado === 'pagado_tardio' || p.mp_revision_motivo)
    : pedidos;

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/pedidos');
      if (!res.ok) throw new Error();
      const { data } = await res.json();
      setPedidos(data || []);
    } catch {
      toast.error('Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function descartar(id: string) {
    try {
      const res = await fetch(`/api/pedidos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'descartado' }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? 'No se pudo descartar el pedido');
        return;
      }
      toast.success('Pedido descartado');
      setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, estado: 'descartado' } : p)));
    } catch {
      toast.error('Error de red');
    }
  }

  async function convertir(id: string) {
    if (convirtiendo) return; // guard contra doble envío
    setConvirtiendo(id);
    try {
      const res = await fetch(`/api/pedidos/${id}/convertir`, { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? 'No se pudo convertir el pedido');
        return;
      }
      const { prenota_id, convertidos, fallidos } = body?.data ?? {};
      const total = convertidos?.length ?? 0;
      const base = `Nota de venta #${prenota_id} creada — ${total} producto${total !== 1 ? 's' : ''}`;
      if (fallidos?.length) {
        const codigos = fallidos.map((f: { codigo: string }) => f.codigo).join(', ');
        toast.warning(`${base}, sin stock: ${codigos}`);
      } else {
        toast.success(base);
      }
      router.push(`/notas-venta/${prenota_id}`);
    } catch {
      toast.error('Error de red');
    } finally {
      setConvirtiendo(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 fade-in zoom-in-95 duration-200">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Pedidos</h1>
        <p className="text-[var(--body)] mt-1">Solicitudes recibidas desde el catálogo y /productos</p>
        <Button
          variant={soloRevision ? 'default' : 'outline'}
          size="sm"
          className="mt-3"
          onClick={() => setSoloRevision((v) => !v)}
        >
          Requieren revisión
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-[var(--muted)] rounded-card" />
          ))}
        </div>
      ) : pedidos.length === 0 ? (
        <div className="border rounded-card p-8 bg-[var(--card)] shadow-sm text-center text-[var(--body-subtle)]">
          No hay pedidos
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibles.map((p) => (
            <div key={p.id} className="border rounded-card bg-[var(--card)] shadow-sm">
              <button
                onClick={() => toggle(p.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div className="min-w-0">
                  <div className="font-medium text-[var(--heading)] truncate">
                    {p.cliente?.nombre || 'Sin nombre'}
                  </div>
                  <div className="text-xs text-[var(--body-subtle)]">
                    {p.cliente?.telefono || 'Sin teléfono'} · {formatFecha(p.created_at)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badgeClass(p.estado)}`}>
                    {ESTADO_LABEL[p.estado] ?? p.estado}
                  </span>
                  {expanded.has(p.id) ? (
                    <ChevronUp className="w-4 h-4 text-[var(--body-subtle)]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[var(--body-subtle)]" />
                  )}
                </div>
              </button>

              {expanded.has(p.id) && (
                <div className="border-t border-border px-4 py-3 flex flex-col gap-3">
                  <div className="text-sm text-[var(--body)] flex flex-col gap-0.5">
                    <span>{p.email_contacto || 'Sin email'}</span>
                    <span>
                      {p.entrega_codigo
                        ? ENTREGA_LABEL[p.entrega_codigo] ?? p.entrega_codigo
                        : 'Sin entrega'}
                      {p.direccion_entrega ? ` · ${p.direccion_entrega}` : ''}
                    </span>
                  </div>
                  {(p.mp_payment_id || p.mp_revision_motivo) && (
                    <div className="text-sm text-[var(--body)] flex flex-col gap-0.5">
                      {p.mp_payment_id && (
                        <span>
                          Pago MP #{p.mp_payment_id}
                          {p.mp_fecha_pago ? ` · ${formatFecha(p.mp_fecha_pago)}` : ''}
                        </span>
                      )}
                      {p.mp_revision_motivo && (
                        <span className="text-[var(--warning)]">Revisión: {p.mp_revision_motivo}</span>
                      )}
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {p.items.map((it, i) => (
                      <div key={i} className="flex justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <span className="font-mono text-xs text-[var(--body-subtle)]">{it.codigo}</span>
                          <div className="text-[var(--heading)] truncate">{it.detalle}</div>
                        </div>
                        <div className="text-right text-[var(--body)] shrink-0">
                          <div>{etiquetaCantidad(it)}</div>
                          <div className="text-xs text-[var(--body-subtle)]">
                            {formatCLP(it.subtotal ?? it.precio * it.cantidad)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1 pt-2 border-t border-border text-sm">
                    <span className="text-[var(--body)]">Entrega: {formatCLP(p.entrega_costo)}</span>
                    <span className="font-semibold">Total: {formatCLP(p.total)}</span>
                  </div>
                  {p.estado === 'pendiente' && (
                    <div className="flex gap-2 self-end">
                      <Button variant="outline" size="sm" onClick={() => descartar(p.id)}>
                        Descartar
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        disabled={convirtiendo === p.id}
                        onClick={() => convertir(p.id)}
                      >
                        {convirtiendo === p.id ? 'Convirtiendo…' : 'Convertir a nota de venta'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
