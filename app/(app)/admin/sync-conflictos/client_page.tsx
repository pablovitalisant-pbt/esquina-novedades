'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldAlert, Inbox } from 'lucide-react';
import { toast } from 'sonner';

type Conflicto = {
  id: number;
  tabla: string;
  operacion: string;
  entidad_id: string | null;
  payload: any;
  http_status: number | null;
  error_mensaje: string | null;
  usuario_nombre: string | null;
  estado: string;
  created_at: string;
};

export function SyncConflictosClient() {
  const [conflictos, setConflictos] = useState<Conflicto[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConflictos = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sync-conflictos?estado=pendiente');
      if (res.ok) {
        const { data } = await res.json();
        setConflictos(data || []);
      } else {
        toast.error('Error al cargar conflictos');
      }
    } catch {
      toast.error('Error al cargar conflictos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConflictos(); }, []);

  const handleDescartar = async (c: Conflicto) => {
    if (!confirm(`¿Descartar el conflicto de ${c.tabla} (${c.entidad_id || c.id})? El cambio local no se aplicará.`)) return;
    try {
      const res = await fetch(`/api/sync-conflictos/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'descartar' }),
      });
      if (res.status === 409) {
        // Idempotencia del backend (Slice 9a) — ya fue resuelto, no es error.
        toast.info('Ya fue resuelto — actualizando lista');
      } else if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'Error al descartar');
      } else {
        toast.success('Conflicto descartado');
      }
      fetchConflictos();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const formatFecha = (v: string) =>
    new Date(v).toLocaleString('es-CL', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="flex flex-col gap-6 w-full fade-in zoom-in-95 duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-8 h-8 text-[var(--primary)]" /> Conflictos de Sincronización
          </h1>
          <p className="text-[var(--body)] mt-1">Operaciones descartadas por fallo permanente en dispositivos offline</p>
        </div>
        <Button variant="outline" onClick={fetchConflictos}>Actualizar</Button>
      </div>

      {loading ? (
        <div className="bg-white border rounded-card shadow-sm">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="text-center py-12 text-[var(--body)] animate-pulse">Cargando...</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ) : conflictos.length === 0 ? (
        <div className="border rounded-card p-12 bg-[var(--card)] shadow-sm text-center text-[var(--body-subtle)]">
          <Inbox className="w-10 h-10 mx-auto mb-3 opacity-50" />
          No hay conflictos pendientes
        </div>
      ) : (
        <div className="bg-white border rounded-card shadow-sm overflow-x-auto">
          <Table>
            <TableHeader className="bg-[var(--muted)] border-b">
              <TableRow>
                <TableHead className="uppercase tracking-wide text-xs">Fecha</TableHead>
                <TableHead className="uppercase tracking-wide text-xs">Tabla</TableHead>
                <TableHead className="uppercase tracking-wide text-xs">Operación</TableHead>
                <TableHead className="uppercase tracking-wide text-xs">Entidad</TableHead>
                <TableHead className="uppercase tracking-wide text-xs">Usuario</TableHead>
                <TableHead className="uppercase tracking-wide text-xs">Error</TableHead>
                <TableHead className="w-24 text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conflictos.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm whitespace-nowrap">{formatFecha(c.created_at)}</TableCell>
                  <TableCell className="font-mono text-sm">{c.tabla}</TableCell>
                  <TableCell><Badge variant="outline">{c.operacion}</Badge></TableCell>
                  <TableCell className="font-mono text-sm">{c.entidad_id ?? '—'}</TableCell>
                  <TableCell className="text-sm">{c.usuario_nombre ?? '—'}</TableCell>
                  <TableCell className="text-sm">
                    {c.http_status != null && (
                      <Badge variant="destructive" className="mr-2">{c.http_status}</Badge>
                    )}
                    {c.error_mensaje}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-[var(--primary)]">ver payload</summary>
                      <pre className="mt-1 text-xs bg-[var(--muted)] p-2 rounded overflow-x-auto">{JSON.stringify(c.payload, null, 2)}</pre>
                    </details>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="destructive" onClick={() => handleDescartar(c)}>Descartar</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
