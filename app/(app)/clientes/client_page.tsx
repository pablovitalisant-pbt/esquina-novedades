'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePowerSync } from '@powersync/react';
import { PowerSyncProvider } from '@/lib/powersync/PowerSyncProvider';
import flags from '@/config/feature-flags.json';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { PlusCircle, Search, Pencil, Trash2, X, Check } from 'lucide-react';

interface Cliente {
  id: string; // UUID desde 13a
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  notas: string | null;
  created_at: string;
  saldo_favor: number; // Slice 3c — disponible del ledger de saldo a favor
}

// ClientesPage decide si montar PowerSync según el flag. Con el flag en false
// (default) NO se monta el provider → comportamiento actual sin cambios.
export function ClientesPage() {
  const OFFLINE_READ = (flags as any)["clientes-offline-lectura"];
  if (OFFLINE_READ) {
    return (
      <PowerSyncProvider>
        <ClientesContent />
      </PowerSyncProvider>
    );
  }
  return <ClientesContent />;
}

function ClientesContent() {
  const OFFLINE_READ = (flags as any)["clientes-offline-lectura"];
  // usePowerSync() devuelve null sin provider (flag off) → branch offline inactivo.
  const db = usePowerSync();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState('');
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
      if (OFFLINE_READ && db) {
        // Lectura local (flag on): replica GET /api/clientes. SQLite LIKE es
        // case-insensitive para ASCII (≈ ILIKE) — no cubre acentos/no-ASCII,
        // diferencia documentada, no solucionada en este slice.
        const rows = (await db.getAll(
          `SELECT id, nombre, telefono, direccion, notas, created_at FROM clientes
           WHERE (? = '' OR nombre LIKE '%' || ? || '%')
           ORDER BY nombre ASC LIMIT 50`,
          [search, search]
        )) as any[];
        setClientes((rows || []).map((r) => ({
          ...r,
          id: String(r.id),
          // Slice 3c: la réplica local de clientes (PowerSync) no sincroniza
          // el ledger clientes_saldo_favor_movimientos, así que el saldo a
          // favor no está disponible offline. Se mapea 0 explícito (nunca
          // undefined) para que el render no truene. Mismo riesgo latente
          // que notas-venta (PRD §10). Flag off en producción.
          saldo_favor: 0,
        })));
        return;
      }
      const url = search ? `/api/clientes?q=${encodeURIComponent(search)}` : '/api/clientes';
      const res = await fetch(url);
      if (res.ok) {
        const { data } = await res.json();
        setClientes(data || []);
      }
    } catch (e) { console.error('[clientes] fetchClientes:', e); }
    finally { setLoading(false); }
  }, [search, db, OFFLINE_READ]);

  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  const resetForm = () => {
    setEditing(null); setNombre(''); setTelefono(''); setDireccion(''); setNotas(''); setShowForm(false);
  };

  const handleSave = async () => {
    if (!nombre.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    try {
      if (OFFLINE_READ && db) {
        // Escritura local (flag on). Sync por uploadData(). id UUID del cliente
        // en el INSERT (local = servidor, sin duplicados).
        const data = { nombre: nombre.trim(), telefono: telefono.trim() || null, direccion: direccion.trim() || null, notas: notas.trim() || null };
        if (editing) {
          await db.execute(
            `UPDATE clientes SET nombre = ?, telefono = ?, direccion = ?, notas = ? WHERE id = ?`,
            [data.nombre, data.telefono, data.direccion, data.notas, editing.id]
          );
          toast.success('Cliente actualizado');
        } else {
          const id = crypto.randomUUID();
          await db.execute(
            `INSERT INTO clientes (id, nombre, telefono, direccion, notas, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, data.nombre, data.telefono, data.direccion, data.notas, new Date().toISOString()]
          );
          toast.success('Cliente creado');
        }
        resetForm();
        fetchClientes();
        return;
      }
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
      if (OFFLINE_READ && db) {
        // Replica el chequeo de dos pasos del endpoint online (posible ahora
        // gracias a Slice 14, que permite que una nota llegue a 'anulada'
        // offline). No se replica la cascada de borrado multi-tabla local:
        // DELETE /api/clientes/[id] la hace server-side al sync.
        // 1) ¿notas activas?
        const notas = (await db.getAll(
          `SELECT estado FROM prenotas WHERE cliente_id = ?`,
          [id]
        )) as any[];
        if (notas.some((n) => n.estado !== 'anulada')) {
          toast.error('No se puede eliminar: el cliente tiene notas de venta asociadas');
          return;
        }
        // 2) ¿movimientos de caja asociados a las notas (aunque anuladas)?
        const mov = (await db.getAll(
          `SELECT 1 FROM caja_movimiento_notas
           WHERE prenota_id IN (SELECT id FROM prenotas WHERE cliente_id = ?)
           LIMIT 1`,
          [id]
        )) as any[];
        if (mov.length > 0) {
          toast.error('No se puede eliminar: existen movimientos de caja asociados a notas anuladas de este cliente');
          return;
        }
        // 3) Pasa ambos → DELETE local.
        await db.execute(`DELETE FROM clientes WHERE id = ?`, [id]);
        toast.success('Cliente eliminado');
        fetchClientes();
        return;
      }
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
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--body)]" />
        <Input
          placeholder="Buscar por nombre..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
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
                    <div className="font-medium">{c.nombre}</div>
                    {c.direccion && <div className="text-xs text-[var(--body)]">{c.direccion}</div>}
                    {Number(c.saldo_favor) > 0.005 && (
                      <div className="text-xs text-[var(--success)] font-medium">
                        Saldo a favor: ${Number(c.saldo_favor).toFixed(2)}
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
