'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { MessageCircle } from 'lucide-react';
import { formatCLP } from '@/lib/utils';

interface DeudaNota {
  id: number;
  titulo: string;
}

interface Deudor {
  cliente_id: string | null;
  cliente_nombre: string;
  telefono: string;
  num_notas: number;
  deuda_total: number;
  notas: DeudaNota[];
  deuda_mas_antigua: string;
}

export function DeudoresClient({ session }: { session: any }) {
  const [deudores, setDeudores] = useState<Deudor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const deudoresRes = await fetch('/api/deudores');
        if (!deudoresRes.ok) throw new Error();
        const { data } = await deudoresRes.json();
        setDeudores(data || []);
      } catch {
        toast.error('Error al cargar deudores');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const formatFecha = (value: string) =>
    new Date(value).toLocaleDateString('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const abrirWhatsApp = (d: Deudor) => {
    const telefono = (d.telefono || '').replace(/\D/g, '');
    if (!telefono) return;
    const monto = formatCLP(d.deuda_total);
    const titulos = d.notas.map((n) => n.titulo).join(', ');
    const msg = `Hola ${d.cliente_nombre}, te recordamos que tienes una deuda pendiente de ${monto} en las notas: ${titulos}`;
    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="flex flex-col gap-6 fade-in zoom-in-95 duration-200">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Deudores</h1>
        <p className="text-[var(--body)] mt-1">Notas de venta pendientes de cobro, agrupadas por cliente</p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-[var(--muted)] rounded-card" />
          ))}
        </div>
      ) : deudores.length === 0 ? (
        <div className="border rounded-card p-8 bg-[var(--card)] shadow-sm text-center text-[var(--body-subtle)]">
          No hay deudas pendientes
        </div>
      ) : (
        <div className="border rounded-card bg-[var(--card)] shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium">Teléfono</th>
                <th className="text-right px-4 py-3 font-medium"># Notas</th>
                <th className="text-left px-4 py-3 font-medium">Notas</th>
                <th className="text-right px-4 py-3 font-medium">Deuda total</th>
                <th className="text-right px-4 py-3 font-medium">Deuda más antigua</th>
              </tr>
            </thead>
            <tbody>
              {deudores.map((d) => (
                <tr key={d.cliente_id ?? `nota:${d.notas[0]?.id}`} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-[var(--heading)]">{d.cliente_nombre}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--body)]">{d.telefono || '—'}</span>
                      <button
                        type="button"
                        data-testid="btn-whatsapp"
                        disabled={!(d.telefono || '').replace(/\D/g, '')}
                        onClick={() => abrirWhatsApp(d)}
                        className="text-[var(--primary)] hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label={`Enviar recordatorio por WhatsApp a ${d.cliente_nombre}`}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">{d.num_notas}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      {d.notas.map((n) => (
                        <Link
                          key={n.id}
                          href={`/notas-venta/${n.id}`}
                          className="text-[var(--primary)] hover:underline w-fit"
                        >
                          {n.titulo}
                        </Link>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-[var(--heading)]">
                    {formatCLP(d.deuda_total)}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--body-subtle)]">
                    {formatFecha(d.deuda_mas_antigua)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
