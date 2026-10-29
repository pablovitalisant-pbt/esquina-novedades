'use client';

import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import flags from '@/config/feature-flags.json';

interface Props {
  open: boolean;
  onClose: () => void;
  producto: {
    codigo: string;
    detalle: string | null;
    imagen_url: string | null;
    empresa_id: number;
    prcventa: number;
    precio_mayor?: number | null;
    cantcaja: number;
    saldo: number;
  };
}

export function AgregarANotaVentaModal({ open, onClose, producto }: Props) {
  const MODALIDAD_UI = (flags as Record<string, boolean>)['notas-venta-modalidad'] === true;
  const puedeMayor = producto.precio_mayor != null;
  const [prenotas, setPrenotas] = useState<Array<{ id: string | number; titulo: string }>>([]);
  const [prenotaId, setPrenotaId] = useState<string>('nueva');
  const [unidades, setUnidades] = useState(1);
  const [modalidad, setModalidad] = useState<'detalle' | 'mayor'>('detalle');
  const [precio, setPrecio] = useState(producto.prcventa);
  const [saving, setSaving] = useState(false);
  const [clienteQuery, setClienteQuery] = useState('');
  const [clientes, setClientes] = useState<Array<{ id: number; nombre: string; telefono: string | null }>>([]);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [clientesLoading, setClientesLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setPrecio(producto.prcventa);
    setModalidad('detalle');
    setUnidades(1);
  }, [producto.prcventa]);

  useEffect(() => {
    if (!open) return;

    async function fetchPrenotas() {
      try {
        const res = await fetch('/api/notas-venta');
        if (res.ok) {
          const { data } = await res.json();
          setPrenotas(data || []);
        } else {
          setPrenotas([]);
        }
      } catch {
        setPrenotas([]);
      }
    }

    fetchPrenotas();
  }, [open]);

  // ─── Búsqueda de clientes con debounce + AbortController ───
  useEffect(() => {
    if (clienteQuery.trim().length < 2) {
      setClientes([]);
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setClientesLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clientes?q=${encodeURIComponent(clienteQuery)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const { data } = await res.json();
          setClientes(data || []);
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === 'AbortError')) setClientes([]);
      } finally {
        setClientesLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [clienteQuery]);

  if (open === false) return null;

  const handleAgregar = async () => {
    setSaving(true);
    try {
      let id = prenotaId;
      if (prenotaId === 'nueva') {
        const body: { cliente_id?: number } = {};
        if (clienteId) body.cliente_id = clienteId;
        const res = await fetch('/api/notas-venta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        id = String(data.id);
      }
      const res = await fetch(`/api/notas-venta/${id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: producto.codigo,
          descripcion: producto.detalle,
          imagen_url: producto.imagen_url,
          empresa_id: producto.empresa_id,
          unidades,
          precio,
          modalidad,
          stock_referencia: producto.saldo,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Error al agregar producto');
        return;
      }
      toast.success('Producto agregado a nota de venta');
      onClose();
    } catch {
      toast.error('No se pudo agregar a nota de venta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-[var(--muted)] rounded-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg">Agregar a Nota de Venta</h2>

        {/* ─── Cliente (nuevo: Slice 18b) ─── */}
        <div>
          <label className="text-xs font-medium text-[var(--body)] uppercase tracking-wide">Cliente</label>
          <input
            placeholder="Buscar cliente..."
            value={clienteQuery}
            onChange={e => { setClienteQuery(e.target.value); setClienteId(null); }}
            className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
          />
          {clientesLoading && <p className="text-xs text-[var(--body)] mt-1">Buscando...</p>}
          {clientes.length > 0 && (
            <ul className="border rounded-lg mt-1 max-h-32 overflow-y-auto text-sm">
              {clientes.map((c) => (
                <li
                  key={c.id}
                  onClick={() => { setClienteId(c.id); setClienteQuery(c.nombre); setClientes([]); }}
                  className={`px-3 py-2 cursor-pointer hover:bg-[var(--muted)] dark:hover:bg-[var(--muted)] ${clienteId === c.id ? 'bg-[var(--primary)] dark:bg-[var(--primary)]/40' : ''}`}
                >
                  <span className="font-medium">{c.nombre}</span>
                  {c.telefono && <span className="text-[var(--body)] ml-2">{c.telefono}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-[var(--body)] uppercase tracking-wide">Nota de Venta</label>
          <select value={prenotaId} onChange={e => setPrenotaId(e.target.value)} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
            <option value="nueva">+ Nueva nota de venta</option>
            {prenotas.map(p => <option key={p.id} value={String(p.id)}>{p.titulo}</option>)}
          </select>
        </div>
        {MODALIDAD_UI && (
          <div className="flex gap-2">
            {(['detalle', 'mayor'] as const).map(m => (
              <button
                key={m}
                type="button"
                disabled={m === 'mayor' && !puedeMayor}
                onClick={() => {
                  setModalidad(m);
                  setPrecio(m === 'mayor' ? Number(producto.precio_mayor) : producto.prcventa);
                }}
                className={`flex-1 border rounded-lg px-4 py-2 text-sm capitalize disabled:opacity-50 ${modalidad === m ? 'bg-[var(--primary)] text-white' : 'hover:bg-[var(--muted)]'}`}
              >
                {m}
              </button>
            ))}
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-[var(--body)] uppercase tracking-wide">Cantidad</label>
          <input type="number" min={1} value={unidades} onChange={e => setUnidades(Number(e.target.value))} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
          <p className="text-xs text-[var(--body)] mt-1">{unidades === 1 ? '1 unidad' : `${unidades} unidades`}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--body)] uppercase tracking-wide">Precio</label>
          <input type="number" min={0} step={0.01} value={precio} onChange={e => setPrecio(Number(e.target.value))} onFocus={e => e.target.select()} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex gap-3 mt-2">
          <button onClick={onClose} className="flex-1 border rounded-lg px-4 py-2 text-sm hover:bg-[var(--muted)]">Cancelar</button>
          <button onClick={handleAgregar} disabled={saving} className="flex-1 bg-[var(--primary)] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[var(--primary)] disabled:opacity-50">
            {saving ? 'Agregando...' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  );
}
