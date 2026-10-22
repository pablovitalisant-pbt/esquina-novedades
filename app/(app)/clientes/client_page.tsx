'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { formatCLP } from '@/lib/utils';
import { PlusCircle, Search, Pencil, Trash2, X, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import flags from '@/config/feature-flags.json';

const ETIQUETAS: Record<string, string> = { mayorista: 'Mayorista', minorista: 'Minorista', ambos: 'Ambos', sin: 'Sin etiqueta' };

interface Cliente {
  id: string; // UUID desde 13a
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  notas: string | null;
  created_at: string;
  saldo_favor: number; // Slice 3c — disponible del ledger de saldo a favor
  etiqueta: string | null; // Slice 6 — derivada de notas activas
}

export function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState('');
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('');
  const [loading, setLoading] = useState(false);

  // Form state
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const fetchClientes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (filtroEtiqueta) params.set('etiqueta', filtroEtiqueta);
      const qs = params.toString();
      const res = await fetch(qs ? `/api/clientes?${qs}` : '/api/clientes');
      if (res.ok) {
        const { data } = await res.json();
        setClientes(data || []);
      }
    } catch (e) { console.error('[clientes] fetchClientes:', e); }
    finally { setLoading(false); }
  }, [search, filtroEtiqueta]);

  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  const resetForm = () => {
    setEditing(null); setNombre(''); setTelefono(''); setDireccion(''); setNotas(''); setShowForm(false);
  };

  const handleSave = async () => {
    if (!nombre.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    try {
      if (editing) {
        await fetch(`/api/clientes/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: nombre.trim(), telefono: telefono.trim() || null, direccion: direccion.trim() || null, notas: notas.trim() || null }),
        });
        toast.success('Cliente actualizado');
      } else {
        await fetch('/api/clientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: nombre.trim(), telefono: telefono.trim() || null, direccion: direccion.trim() || null, notas: notas.trim() || null }),
        });
        toast.success('Cliente creado');
      }
      resetForm();
      fetchClientes();
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este cliente?')) return;
    try {
      const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' });
      if (res.status === 409) {
        toast.error('No se puede eliminar: el cliente tiene notas de venta asociadas');
      } else if (res.ok) {
        toast.success('Cliente eliminado');
        fetchClientes();
      } else {
        toast.error('Error al eliminar');
      }
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const startEdit = (c: Cliente) => {
    setEditing(c);
    setNombre(c.nombre);
    setTelefono(c.telefono || '');
    setDireccion(c.direccion || '');
    setNotas(c.notas || '');
    setShowForm(true);
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto fade-in zoom-in-95 duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-[var(--body)] mt-1">Gestioná tus clientes</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <PlusCircle className="w-4 h-4 mr-2" /> Nuevo cliente
        </Button>
      </div>

      {/* ─── Búsqueda ─── */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--body)]" />
          <Input
            placeholder="Buscar por nombre..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {flags['clientes-etiqueta'] && (
          <select
            aria-label="Filtrar por etiqueta"
            value={filtroEtiqueta}
            onChange={e => setFiltroEtiqueta(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm bg-white bg-[var(--muted)]900"
          >
            <option value="">Todas las etiquetas</option>
            {Object.entries(ETIQUETAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
      </div>

      {/* ─── Formulario ─── */}
      {showForm && (
        <div className="bg-white bg-[var(--muted)]900 border rounded-xl p-5 flex flex-col gap-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{editing ? 'Editar cliente' : 'Nuevo cliente'}</h2>
            <button onClick={resetForm}><X className="w-4 h-4" /></button>
          </div>
          <Input placeholder="Nombre *" value={nombre} onChange={e => setNombre(e.target.value)} />
          <Input placeholder="Teléfono" value={telefono} onChange={e => setTelefono(e.target.value)} />
          <Input placeholder="Dirección" value={direccion} onChange={e => setDireccion(e.target.value)} />
          <Input placeholder="Notas" value={notas} onChange={e => setNotas(e.target.value)} />
          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              <Check className="w-4 h-4 mr-2" /> {saving ? 'Guardando...' : 'Guardar'}
            </Button>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* ─── Tabla ─── */}
      {loading ? (
        <p className="text-sm text-[var(--body)]">Cargando...</p>
      ) : clientes.length === 0 ? (
        <p className="text-sm text-[var(--body)]">{search ? 'Sin resultados' : 'No hay clientes registrados'}</p>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)]50 bg-[var(--muted)]900">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Teléfono</th>
                <th className="text-right px-4 py-3 font-medium w-24">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map(c => (
                <tr key={c.id} className="border-t border-[var(--border)] border-[var(--border)]800">
                  <td className="px-4 py-3">
                    <div className="font-medium flex items-center gap-2">
                      {c.nombre}
                      {flags['clientes-etiqueta'] && c.etiqueta && (
                        <Badge variant="secondary" data-testid="etiqueta-badge">{ETIQUETAS[c.etiqueta] ?? c.etiqueta}</Badge>
                      )}
                    </div>
                    {c.direccion && <div className="text-xs text-[var(--body)]">{c.direccion}</div>}
                    {Number(c.saldo_favor) > 0.005 && (
                      <div className="text-xs text-[var(--success)] font-medium">
                        Saldo a favor: {formatCLP(Number(c.saldo_favor))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--body)] hidden md:table-cell">{c.telefono || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => startEdit(c)} className="p-1 text-[var(--body)] hover:text-[var(--primary)]"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(c.id)} aria-label={`Eliminar ${c.nombre}`} className="p-1 text-[var(--body)] hover:text-[var(--destructive)] ml-1"><Trash2 className="w-4 h-4" /></button>
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
