'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, PackagePlus, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';

type Producto = {
  codigo: string;
  detalle: string | null;
  saldo: number;
  cantcaja: number;
  umed: string | null;
};

export function IngresosClient({ empresaId }: { empresaId: number }) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [seleccionado, setSeleccionado] = useState<Producto | null>(null);

  const [cambioPacking, setCambioPacking] = useState(false);
  const [cantcajaNuevo, setCantcajaNuevo] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [saving, setSaving] = useState(false);

  const buscar = async () => {
    if (!busqueda.trim()) return;
    setBuscando(true);
    try {
      const params = new URLSearchParams({ empresa: String(empresaId), search: busqueda.trim() });
      const res = await fetch(`/api/ubicaciones?${params.toString()}`);
      if (!res.ok) {
        toast.error('Error buscando producto');
        return;
      }
      const { data } = await res.json();
      setResultados(data || []);
    } catch {
      toast.error('Error buscando producto');
    } finally {
      setBuscando(false);
    }
  };

  const registrar = async () => {
    if (!seleccionado) return;
    const n = Number(cantidad);
    if (!Number.isInteger(n) || n <= 0) {
      toast.error('Cantidad inválida');
      return;
    }
    if (cambioPacking) {
      const nc = Number(cantcajaNuevo);
      if (!Number.isInteger(nc) || nc <= 0) {
        toast.error('Nuevo packing inválido');
        return;
      }
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        codigo: seleccionado.codigo,
        cantidad: n,
        observaciones: observaciones.trim() || null,
      };
      if (cambioPacking) body.cantcaja_nuevo = Number(cantcajaNuevo);
      const res = await fetch('/api/ingresos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Error al registrar ingreso');
        return;
      }
      toast.success('Ingreso registrado');
      // reset
      setSeleccionado(null);
      setResultados([]);
      setBusqueda('');
      setCambioPacking(false);
      setCantcajaNuevo('');
      setCantidad('');
      setObservaciones('');
    } catch {
      toast.error('Error al registrar ingreso');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 fade-in zoom-in-95 duration-200 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Ingreso de Mercadería</h1>
        <p className="text-[var(--body)] mt-1">Registra partidas recibidas y suma stock</p>
      </div>

      {/* Buscador */}
      <div className="border rounded-card p-5 bg-[var(--card)] shadow-sm flex flex-col gap-4">
        <h2 className="font-semibold text-base flex items-center gap-2">
          <Search className="w-4 h-4 text-[var(--primary)]" />
          Buscar producto
        </h2>
        <div className="flex gap-2">
          <Input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') buscar(); }}
            placeholder="Código o nombre..."
            className="flex-1"
          />
          <Button onClick={buscar} disabled={buscando || !busqueda.trim()}>
            <Search className="w-4 h-4 mr-2" />
            {buscando ? 'Buscando...' : 'Buscar'}
          </Button>
        </div>

        {resultados.length > 0 && !seleccionado && (
          <div className="flex flex-col gap-2">
            {resultados.map(p => (
              <button
                key={p.codigo}
                onClick={() => { setSeleccionado(p); setResultados([]); }}
                className="flex items-center justify-between border rounded-lg px-4 py-3 text-left hover:bg-[var(--muted)]/50 transition-colors"
              >
                <div>
                  <div className="font-mono font-semibold">{p.codigo}</div>
                  <div className="text-sm text-[var(--body)] truncate max-w-xs">{p.detalle || ''}</div>
                </div>
                <div className="text-xs text-[var(--body)]">Stock: {p.saldo}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Formulario */}
      {seleccionado && (
        <div className="border rounded-card p-5 bg-[var(--card)] shadow-sm flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono font-bold text-lg">{seleccionado.codigo}</div>
              <div className="text-sm text-[var(--body)]">{seleccionado.detalle || ''}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => { setSeleccionado(null); setResultados([]); }}>
              <RefreshCcw className="w-4 h-4" />
            </Button>
          </div>

          <div className="text-sm rounded-lg bg-[var(--muted)]/40 px-4 py-3">
            Packing actual: <strong>{seleccionado.cantcaja}</strong> U/caja
            <span className="text-[var(--body)]"> · Stock actual: {seleccionado.saldo}</span>
          </div>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={cambioPacking}
              onChange={e => setCambioPacking(e.target.checked)}
              className="w-4 h-4 accent-[var(--primary)]"
            />
            ¿Cambió el packing de esta partida?
          </label>

          {cambioPacking && (
            <div>
              <label className="text-xs font-medium text-[var(--body)] uppercase tracking-wide">Nuevo packing (U/caja) *</label>
              <Input
                type="number"
                min={1}
                value={cantcajaNuevo}
                onChange={e => setCantcajaNuevo(e.target.value)}
                placeholder="Ej: 24"
                className="mt-1"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-[var(--body)] uppercase tracking-wide">Cantidad total recibida *</label>
            <Input
              type="number"
              min={1}
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
              placeholder="Ej: 200"
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--body)] uppercase tracking-wide">Observaciones</label>
            <Input
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              placeholder="Opcional..."
              className="mt-1"
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={registrar}
              disabled={saving || !cantidad}
              className="bg-[var(--primary)] hover:bg-[var(--primary)] text-white"
            >
              <PackagePlus className="w-4 h-4 mr-2" />
              {saving ? 'Registrando...' : 'Registrar ingreso'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
