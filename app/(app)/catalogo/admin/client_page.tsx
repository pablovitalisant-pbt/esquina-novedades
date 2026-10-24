'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { PlusCircle, Search, Trash2, Link as LinkIcon, ExternalLink, FileDown, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { SessionProp } from '@/types';
// single-tenant (hook legacy eliminado, PRD §9.17)
import { CrearCatalogoDialog } from '@/components/CrearCatalogoDialog';
import dynamic from 'next/dynamic';
// ponytail: inlined from catalogos/catalogos-utils (deleted, PRD section 4).
// Contract adapted to catalogo/admin data model: no 'categoria' field.
// Verified against __tests__/catalogos-utils.test.ts (minus categoria tests).
type CatalogoRow = {
  id: string;
  titulo: string;
  descripcion: string | null;
  slug: string;
  activo: boolean;
  margen_precio: string;
  user_id: string | null;
  palabras_excluir?: string | null;
  mostrar_precio?: boolean;
};

type CatalogoItem = {
  codigo: string;
  detalle: string | null;
  imagen_url: string | null;
  precio_catalogo: number | null;
  precio_override?: number | null;
};

export function filtrarCatalogos<T extends { titulo: string; descripcion: string | null }>(catalogos: T[], busqueda: string): T[] {
  const q = busqueda.trim().toLowerCase();
  if (q.length < 2) return catalogos;
  const normalize = (s: string | null) =>
    (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/);
  return catalogos.filter(c =>
    words.some(w =>
      normalize(c.titulo).includes(w) ||
      normalize(c.descripcion).includes(w)
    )
  );
}
const QRCodeSVG = dynamic(() => import('qrcode.react').then(mod => mod.QRCodeSVG), { ssr: false });

// crear/editar/eliminar catálogo requieren conexión (slug server-side).
export function CatalogoAdminClient({ session }: { session: SessionProp }) {
  const activeEmpresaId = 1; // single-tenant
  const [catalogos, setCatalogos] = useState<CatalogoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  
  // --- Estado modal edición ---
  const [editingCatalog, setEditingCatalog] = useState<CatalogoRow | null>(null);
  const [editItems, setEditItems] = useState<CatalogoItem[]>([]);
  const [editMargen, setEditMargen] = useState<number>(0);
  const [editOverrides, setEditOverrides] = useState<Record<string, number | null>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const editItemsOriginalRef = useRef<CatalogoItem[]>([]);

  const [isCreating, setIsCreating] = useState(false);

  const fetchCatalogos = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/catalogos?empresa=${activeEmpresaId}`);
      if (res.ok) {
        const { data } = await res.json();
        setCatalogos(data || []);
      }
    } catch {
      toast.error('Error cargando catálogos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalogos();
  }, []);

  const downloadQR = (slug: string) => {
    const svgEl = document.querySelector(`[data-qr="${slug}"] svg`) as SVGElement;
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx?.drawImage(img, 0, 0, 256, 256);
      const a = document.createElement('a');
      a.download = `qr-${slug}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este catálogo?')) return;
    // Escritura offline bloqueada con mensaje claro
    if (!navigator.onLine) {
      toast.error('Eliminar un catálogo requiere conexión a internet.');
      return;
    }
    try {
      const res = await fetch(`/api/catalogos/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Eliminado correctamente');
        setCatalogos(prev => prev.filter(c => c.id !== id));
      }
    } catch {
      toast.error('Error al eliminar');
    }
  };

  // --- Funciones edición ---

  const handleOpenEdit = async (cat: CatalogoRow) => {
    // No se abre el modal de edición offline (no se puede calcular la lista de
    // productos del catálogo sin conexión — el servidor la recalcula).
    if (!navigator.onLine) {
      toast.error('Editar un catálogo requiere conexión a internet.');
      return;
    }
    setEditingCatalog(cat);
    setEditItems([]);
    setEditMargen(parseFloat(String(cat.margen_precio)) || 0);
    setEditOverrides({});
    setEditLoading(true);
    try {
      const res = await fetch(`/api/catalogos/public/${cat.slug}`);
      if (res.ok) {
        const { data } = await res.json();
        setEditItems(data.productos || []);
        editItemsOriginalRef.current = data.productos || [];
        // Populate existing overrides from response
        const overrides: Record<string, number | null> = {};
        (data.productos || []).forEach((p: CatalogoItem) => {
          if (p.precio_override != null) overrides[p.codigo] = p.precio_override;
        });
        setEditOverrides(overrides);
      } else {
        toast.error('Error al cargar productos del catálogo');
        setEditingCatalog(null);
      }
    } catch {
      toast.error('Error al cargar productos del catálogo');
      setEditingCatalog(null);
    } finally {
      setEditLoading(false);
    }
  };

  const handleRemoveItem = (productoId: string) => {
    setEditItems(prev => prev.filter(item => item.codigo !== productoId));
  };

  const handleOverrideChange = (codigo: string, value: string) => {
    setEditOverrides(prev => {
      const next = { ...prev };
      const num = parseFloat(value);
      if (isNaN(num) || value.trim() === '' || num <= 0) {
        delete next[codigo];
      } else {
        next[codigo] = num;
      }
      return next;
    });
  };

  const handleSaveEdit = async () => {
    if (!editingCatalog) return;
    setEditSaving(true);
    try {
      // Códigos que quedaron en el listado
      const codigosRestantes = new Set(editItems.map(p => p.codigo.toUpperCase()));

      // Códigos originales que fueron eliminados por el usuario
      const codigosEliminados = editItemsOriginalRef.current
        .map(p => p.codigo.toUpperCase())
        .filter(c => !codigosRestantes.has(c));

      // Combinar con palabras_excluir existentes del catálogo
      const excluirActual = editingCatalog.palabras_excluir
        ? editingCatalog.palabras_excluir.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [];

      const nuevasExclusiones = Array.from(
        new Set([...excluirActual, ...codigosEliminados])
      ).join(', ');

      // Build precio_overrides array from editOverrides state
      const precio_overrides = Object.entries(editOverrides).map(([codigo, precio]) => ({
        codigo,
        precio,
      }));

      const res = await fetch(`/api/catalogos/${editingCatalog.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          palabras_excluir: nuevasExclusiones,
          margen_precio: editMargen,
          precio_overrides,
        }),
      });
      if (res.ok) {
        toast.success('Catálogo actualizado');
        setEditingCatalog(null);
        setEditItems([]);
        setEditMargen(0);
        setEditOverrides({});
        editItemsOriginalRef.current = [];
        fetchCatalogos();
      } else {
        toast.error('Error al guardar cambios');
      }
    } catch {
      toast.error('Error al guardar cambios');
    } finally {
      setEditSaving(false);
    }
  };

  const getPublicUrl = (slug: string) => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/catalogo/${slug}`;
  };

  const catalogosFiltrados = useMemo(
    () => filtrarCatalogos(catalogos, busqueda),
    [catalogos, busqueda]
  );
  const sugerencias = useMemo(
    () => catalogosFiltrados.slice(0, 6),
    [catalogosFiltrados]
  );

  return (
    <div className="flex flex-col gap-6 w-full fade-in zoom-in-95 duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Catálogos Personalizados</h1>
          <p className="text-[var(--body)] mt-1">Crea listas de productos para compartir con clientes</p>
        </div>
        <Button onClick={() => setIsCreating(true)} className="bg-[var(--primary)] hover:bg-[var(--primary)] text-white shadow-md">
          <PlusCircle className="w-5 h-5 mr-2" />
          Nuevo Catálogo
        </Button>
      </div>

      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--body-subtle)]" />
        <Input
          placeholder="Buscar por título, descripción o categoría..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          onFocus={() => setMostrarSugerencias(true)}
          onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
          className="pl-9"
        />
        {mostrarSugerencias && busqueda.trim().length >= 2 && sugerencias.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-[var(--card)] border border-[var(--border)] border-[var(--border)]700 rounded-lg shadow-lg overflow-hidden">
            {sugerencias.map(cat => (
              <button
                key={cat.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--muted)] dark:hover:bg-[var(--muted)] transition-colors"
                onClick={() => window.open(getPublicUrl(cat.slug), '_blank')}
              >
                {cat.titulo}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-[var(--body)] animate-pulse">Cargando...</div>
      ) : catalogos.length === 0 ? (
        <div className="border border-dashed rounded-card p-12 text-center bg-[var(--muted)]/50">
           <h3 className="text-lg font-bold mb-2">No tienes catálogos</h3>
           <p className="text-[var(--body)] mb-4">Crea tu primer catálogo para agrupar productos y compartirlos.</p>
           <Button onClick={() => setIsCreating(true)} variant="default">Crear Nuevo</Button>
        </div>
      ) : catalogosFiltrados.length === 0 ? (
        <div className="border border-dashed rounded-card p-12 text-center bg-[var(--muted)]/50">
          <h3 className="text-lg font-bold mb-2">Sin resultados</h3>
          <p className="text-[var(--body)]">No se encontraron catálogos para la búsqueda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {catalogosFiltrados.map(cat => (
            <div key={cat.id} className="bg-[var(--card)] border rounded-card p-5 shadow-sm flex flex-col justify-between">
              <div>
                {/* Header */}
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-lg leading-tight line-clamp-1" title={cat.titulo}>{cat.titulo}</h3>
                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${cat.activo ? 'bg-[var(--success)]/10' : 'bg-[var(--destructive)]/10'}`} title={cat.activo ? 'Activo' : 'Inactivo'} />
                </div>
                <p className="text-sm text-[var(--body)] line-clamp-2 mb-4 h-10">{cat.descripcion || 'Sin descripción'}</p>

                {/* QR centrado */}
                <div className="flex flex-col items-center gap-2 mb-4">
                  <div data-qr={cat.slug} className="bg-white p-2 rounded-lg border shadow-sm">
                    <QRCodeSVG value={getPublicUrl(cat.slug)} size={96} level="M" />
                  </div>
                  <button onClick={() => downloadQR(cat.slug)} className="text-xs text-[var(--primary)] hover:underline">
                    Descargar QR
                  </button>
                </div>

                {/* Slug copiable */}
                <div className="bg-[var(--muted)]100 bg-[var(--muted)]800 rounded-lg p-2 text-xs font-mono text-[var(--body)] dark:text-[var(--body-subtle)] flex items-center justify-between mb-2">
                  <span className="truncate mr-2">.../catalogo/{cat.slug}</span>
                  <button onClick={() => {
                    window.navigator.clipboard.writeText(getPublicUrl(cat.slug));
                    toast.success('Enlace copiado');
                  }} className="p-1 hover:text-[var(--primary)] flex-shrink-0">
                    <LinkIcon className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 border-t pt-4 mt-2">
                <Button variant="outline" className="flex-1 text-xs" onClick={() => window.open(getPublicUrl(cat.slug), '_blank')}>
                  <ExternalLink className="w-3 h-3 mr-2" /> Ver
                </Button>
                <Button variant="outline" className="flex-1 text-xs" onClick={() => window.open(getPublicUrl(cat.slug) + '?print=1', '_blank')}>
                  <FileDown className="w-3 h-3 mr-2" /> PDF
                </Button>
                {cat.user_id === session?.user?.id && (
                  <Button
                    variant="outline"
                    className="flex-1 text-xs"
                    onClick={() => handleOpenEdit(cat)}
                  >
                    <Pencil className="w-3 h-3 mr-2" /> Editar
                  </Button>
                )}
                <Button variant="destructive" size="icon" onClick={() => handleDelete(cat.id)} aria-label={`Eliminar ${cat.titulo}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CrearCatalogoDialog
        open={isCreating}
        onOpenChange={setIsCreating}
        empresaId={activeEmpresaId}
        onCreated={fetchCatalogos}
      />

      {/* Modal edición de productos */}
      <Dialog open={!!editingCatalog} onOpenChange={(open) => { if (!open) { setEditingCatalog(null); setEditItems([]); setEditMargen(0); setEditOverrides({}); } }}>
        <DialogContent className="w-full h-full sm:h-auto sm:max-w-lg sm:max-h-[90vh] sm:mx-4 overflow-y-auto p-5 rounded-none sm:rounded-card">
          <DialogHeader>
            <DialogTitle>Editar catálogo: {editingCatalog?.titulo}</DialogTitle>
          </DialogHeader>

          <div className="py-2">
            <label className="text-sm font-medium text-[var(--body)] dark:text-[var(--body)]">
              Porcentaje sobre costo (%)
            </label>
            <Input
              type="number"
              min={0}
              max={999.99}
              step={0.01}
              value={editMargen}
              onChange={e => setEditMargen(parseFloat(e.target.value) || 0)}
              className="mt-1 w-40"
            />
          </div>

          <div className="py-2">
            {editLoading ? (
              <div className="py-8 text-center text-[var(--body)] animate-pulse">Cargando productos...</div>
            ) : editItems.length === 0 ? (
              <div className="py-8 text-center text-[var(--body-subtle)] text-sm">
                No hay productos en este catálogo.
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {editItems.map((item) => (
                  <li
                    key={item.codigo}
                    className="flex items-center gap-3 bg-[var(--muted)] bg-[var(--muted)]800 rounded-lg p-3"
                  >
                    {item.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- preview de item en modal de edición; el tamaño real se sirve desde Cloudinary
                      <img
                        src={item.imagen_url}
                        alt={item.detalle ?? undefined}
                        className="w-10 h-10 object-cover rounded-md flex-shrink-0 border"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-md flex-shrink-0 border bg-[var(--muted)] bg-[var(--muted)]700" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight line-clamp-2">
                        {item.detalle || 'Sin nombre'}
                      </p>
                      {item.precio_catalogo != null && (
                        <p className="text-xs text-[var(--body)] mt-0.5">${item.precio_catalogo}</p>
                      )}
                    </div>
                    {editingCatalog?.mostrar_precio && (
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        aria-label={`Precio individual ${item.codigo}`}
                        placeholder={item.precio_catalogo != null ? `$${item.precio_catalogo}` : 'Precio'}
                        value={editOverrides[item.codigo] ?? ''}
                        onChange={e => handleOverrideChange(item.codigo, e.target.value)}
                        className="w-20 h-8 rounded-md border border-[var(--border)] border-[var(--border)]700 bg-transparent px-2 text-xs text-right focus:outline-none focus:ring-2 focus:ring-[var(--ring)] flex-shrink-0"
                      />
                    )}
                    <button
                      aria-label="Eliminar producto"
                      onClick={() => handleRemoveItem(item.codigo)}
                      className="p-1.5 rounded-md text-[var(--destructive)] hover:bg-[var(--destructive)]/10 dark:hover:bg-[var(--destructive)]/10/20 flex-shrink-0 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingCatalog(null); setEditItems([]); setEditMargen(0); setEditOverrides({}); }} disabled={editSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={editSaving || editLoading}>
              {editSaving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
