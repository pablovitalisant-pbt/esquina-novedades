'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ClipboardList, Trash2, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { SessionProp } from '@/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

type Registro = {
  id: number;
  folio: string;
  empresa_id: number;
  usuario_id: number;
  usuario_nombre: string;
  observacion: string | null;
  created_at: string;
};

export function RegistroNotasPage({ session }: { session: SessionProp }) {
  const rol = session?.user?.rol as string;
  const isAdmin = rol === 'admin';

  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroFolio, setFiltroFolio] = useState('');
  const [filtroFecha, setFiltroFecha] = useState('');
  const [debouncedFolio, setDebouncedFolio] = useState('');

  const [folio, setFolio] = useState('');
  const empresaId = 1; // single-tenant (migracion 018)
  const [observacion, setObservacion] = useState('');
  const [saving, setSaving] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [obsEliminacion, setObsEliminacion] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedFolio(filtroFolio), 400);
    return () => clearTimeout(t);
  }, [filtroFolio]);

  const fetchRegistros = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedFolio) params.set('folio', debouncedFolio);
      if (filtroFecha) params.set('fecha', filtroFecha);
      const res = await fetch(`/api/bodega/registro-notas?${params.toString()}`);
      if (res.ok) {
        const { data } = await res.json();
        setRegistros(data || []);
      }
    } catch {
      toast.error('Error cargando registros');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistros();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFolio, filtroFecha]);

  const handleRegistrar = async () => {
    if (!folio.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/bodega/registro-notas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folio: folio.trim(), empresa_id: empresaId, observacion: observacion.trim() || null }),
      });
      if (res.ok) {
        toast.success('Nota registrada');
        setFolio('');
        setObservacion('');
        await fetchRegistros();
      } else {
        const { error } = await res.json();
        toast.error(error || 'Error al registrar');
      }
    } catch {
      toast.error('Error al registrar');
    } finally {
      setSaving(false);
    }
  };

  const handleEliminar = async () => {
    if (!eliminandoId) return;
    try {
      const res = await fetch(`/api/bodega/registro-notas/${eliminandoId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observacion: obsEliminacion.trim() || null }),
      });
      if (res.ok) {
        setRegistros(prev => prev.filter(r => r.id !== eliminandoId));
        toast.success('Registro eliminado');
        setEliminandoId(null);
        setObsEliminacion('');
      } else {
        toast.error('Error al eliminar');
      }
    } catch {
      toast.error('Error al eliminar');
    }
  };


  return (
    <div className="flex flex-col gap-6 fade-in zoom-in-95 duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Registro de Notas</h1>
          <p className="text-[var(--body)] mt-1">Control de custodia de notas de venta hacia bodega</p>
        </div>
      </div>

      {/* Formulario de registro */}
      <div className="border rounded-card p-5 bg-[var(--card)] shadow-sm flex flex-col gap-4">
        <h2 className="font-semibold text-base flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-[var(--primary)]" />
          Registrar nota
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium text-[var(--body)] uppercase tracking-wide">N° Nota *</label>
            <Input
              value={folio}
              onChange={e => setFolio(e.target.value)}
              onFocus={e => e.target.select()}
              placeholder="Ej: 001234"
              className="mt-1"
              onKeyDown={e => { if (e.key === 'Enter') handleRegistrar(); }}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="text-xs font-medium text-[var(--body)] uppercase tracking-wide">Observación</label>
            <Input
              value={observacion}
              onChange={e => setObservacion(e.target.value)}
              placeholder="Opcional..."
              className="mt-1"
              onKeyDown={e => { if (e.key === 'Enter') handleRegistrar(); }}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={handleRegistrar}
            disabled={!folio.trim() || saving}
            className="bg-[var(--primary)] hover:bg-[var(--primary)] text-primary-foreground"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            {saving ? 'Registrando...' : 'Registrar'}
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Filtrar por N° nota..."
          value={filtroFolio}
          onChange={e => setFiltroFolio(e.target.value)}
          className="max-w-xs"
        />
        <input
          type="date"
          value={filtroFecha}
          onChange={e => setFiltroFecha(e.target.value)}
          className="text-sm border border-[var(--border)] border-[var(--border)]700 rounded-lg px-3 py-2 bg-[var(--card)] text-[var(--body)] dark:text-[var(--body)]"
        />
        {(filtroFolio || filtroFecha) && (
          <Button variant="outline" className="text-xs" onClick={() => { setFiltroFolio(''); setFiltroFecha(''); }}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex flex-col gap-3 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 bg-[var(--muted)] rounded-card" />
          ))}
        </div>
      ) : registros.length === 0 ? (
        <div className="text-center py-16 text-[var(--body-subtle)]">
          No hay registros aún.
        </div>
      ) : (
        <div className="border rounded-card overflow-hidden bg-[var(--card)] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)]50 bg-[var(--muted)]950/50 text-[var(--body)]">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">N° Nota</th>
                  <th className="text-left px-4 py-3 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium">Hora</th>
                  <th className="text-left px-4 py-3 font-medium">Usuario</th>
                  <th className="text-left px-4 py-3 font-medium">Observación</th>
                  {isAdmin && <th className="text-right px-4 py-3 font-medium">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {registros.map(r => {
                  const dt = parseISO(r.created_at);
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-3 font-mono font-semibold text-[var(--body)] dark:text-[var(--body)]">{r.folio}</td>
                      <td className="px-4 py-3 text-[var(--body)] dark:text-[var(--body)]">
                        {format(dt, 'dd MMM yyyy', { locale: es })}
                      </td>
                      <td className="px-4 py-3 text-[var(--body)] dark:text-[var(--body)]">
                        {format(dt, 'HH:mm', { locale: es })}
                      </td>
                      <td className="px-4 py-3 font-medium">{r.usuario_nombre}</td>
                      <td className="px-4 py-3 text-[var(--body)] italic">{r.observacion || '—'}</td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs text-[var(--destructive)] border-[var(--destructive)]/30 hover:bg-[var(--destructive)]/10"
                            onClick={() => { setEliminandoId(r.id); setObsEliminacion(''); }}
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Eliminar
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={eliminandoId !== null} onOpenChange={open => { if (!open) { setEliminandoId(null); setObsEliminacion(''); } }}>
        <DialogContent className="sm:max-w-md p-5">
          <DialogHeader>
            <DialogTitle>Eliminar registro</DialogTitle>
          </DialogHeader>
          <div className="py-4 flex flex-col gap-3">
            <p className="text-sm text-[var(--body)] dark:text-[var(--body-subtle)]">
              Esta acción quedará registrada en la auditoría del sistema.
            </p>
            <div>
              <label className="text-xs font-medium text-[var(--body)] uppercase tracking-wide">
                Observación (opcional)
              </label>
              <textarea
                value={obsEliminacion}
                onChange={e => setObsEliminacion(e.target.value)}
                placeholder="Motivo de eliminación..."
                rows={3}
                className="mt-1 w-full rounded-md border border-[var(--border)] border-[var(--border)]700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] bg-[var(--muted)]900 resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setEliminandoId(null); setObsEliminacion(''); }}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleEliminar}
            >
              Confirmar eliminación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
