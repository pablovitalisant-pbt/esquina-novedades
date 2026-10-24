'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { GripVertical, Plus, Trash2, Search, Loader2, X, Tag, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { CrearCatalogoDialog } from '@/components/CrearCatalogoDialog';

type Producto = {
  id: number;
  codigo: string;
  detalle: string;
  imagen_url: string | null;
  categoria: string | null;
};

export type Categoria = {
  id: string; // UUID desde 12 (migración 029)
  nombre: string;
  total_productos: number;
};

// ---------------------------------------------------------------------------
// Draggable product card
// ---------------------------------------------------------------------------
function ProductoCard({
  producto,
  isSelected,
  onToggle,
}: {
  producto: Producto;
  isSelected: boolean;
  onToggle: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `producto-${producto.id}`,
    data: { producto },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-2 bg-[var(--card)] border rounded-lg px-2 py-2 h-[80px] select-none transition-opacity ${
        isDragging ? 'opacity-40' : isSelected ? 'ring-2 ring-[var(--ring)] hover:border-[var(--primary)]/30' : 'hover:border-[var(--primary)]/30'
      }`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onClick={e => e.stopPropagation()}
        onChange={() => onToggle(producto.id)}
        className="w-4 h-4 rounded border-[var(--border)] flex-shrink-0 cursor-pointer"
      />
      <div
        {...listeners}
        {...attributes}
        className="text-[var(--body-subtle)] hover:text-[var(--body)] cursor-grab active:cursor-grabbing flex-shrink-0"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      <div className="flex-shrink-0 w-12 h-12 rounded bg-[var(--muted)] overflow-hidden relative">
        {producto.imagen_url ? (
          <Image
            src={producto.imagen_url}
            alt={producto.codigo}
            fill
            className="object-contain"
            sizes="48px"
          />
        ) : (
          <div className="w-full h-full bg-[var(--muted)]" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs font-bold text-[var(--heading)] truncate">
          {producto.codigo}
        </div>
        <div className="text-xs text-[var(--body)] dark:text-[var(--body-subtle)] truncate leading-tight mt-0.5">
          {producto.detalle}
        </div>
        {producto.categoria && (
          <Badge variant="secondary" className="mt-1 text-[10px] h-4 px-1">
            {producto.categoria}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Droppable category card
// ---------------------------------------------------------------------------
function CategoriaCard({
  categoria,
  onDelete,
  onGenerarCatalogo,
}: {
  categoria: Categoria;
  onDelete: (id: string, total_productos: number) => void;
  onGenerarCatalogo: (nombre: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `categoria-${categoria.id}`,
    data: { categoriaId: categoria.id, nombre: categoria.nombre },
  });

  return (
    <div
      ref={setNodeRef}
      className={`border rounded-card p-4 min-h-[120px] flex flex-col gap-2 transition-all ${
        isOver
          ? 'ring-2 ring-[var(--ring)] bg-[var(--primary)]/10 border-[var(--primary)]/30'
          : 'bg-[var(--card)] hover:border-[var(--border)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Tag className="w-4 h-4 text-[var(--body-subtle)] flex-shrink-0" />
          <span className="font-semibold text-sm truncate">{categoria.nombre}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Badge variant="secondary" className="text-xs">
            {categoria.total_productos}
          </Badge>
          <button
            onClick={() => onDelete(categoria.id, categoria.total_productos)}
            className="text-[var(--body-subtle)] hover:text-[var(--destructive)] transition-colors p-0.5"
            title="Eliminar categoría"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <button
        onClick={() => onGenerarCatalogo(categoria.nombre)}
        className="text-xs text-[var(--primary)] hover:brightness-110 flex items-center gap-1 mt-2"
        title="Generar catálogo para esta categoría"
      >
        <BookOpen className="w-3 h-3" />
        Generar catálogo
      </button>
      {isOver && (
        <div className="flex-1 flex items-center justify-center text-[var(--primary)] text-xs font-medium">
          Soltar aquí
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drag overlay — compact card shown while dragging
// ---------------------------------------------------------------------------
function DragOverlayCard({ producto, count }: { producto: Producto; count?: number }) {
  return (
    <div className="relative flex items-center gap-2 bg-[var(--card)] border border-[var(--primary)]/30 rounded-lg px-2 py-2 h-[80px] shadow-lg opacity-95 w-[280px]">
      {count && count > 1 && (
        <span className="absolute -top-2 -right-2 bg-[var(--primary)] text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center z-10">
          {count}
        </span>
      )}
      <GripVertical className="w-4 h-4 text-[var(--body-subtle)] flex-shrink-0" />
      <div className="flex-shrink-0 w-12 h-12 rounded bg-[var(--muted)] overflow-hidden relative">
        {producto.imagen_url ? (
          <Image
            src={producto.imagen_url}
            alt={producto.codigo}
            fill
            className="object-contain"
            sizes="48px"
          />
        ) : (
          <div className="w-full h-full bg-[var(--muted)]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs font-bold text-[var(--heading)] truncate">
          {producto.codigo}
        </div>
        <div className="text-xs text-[var(--body)] truncate">{producto.detalle}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function CategoriasClient({
  categorias: initialCategorias,
}: {
  categorias: Categoria[];
}) {
  const activeEmpresaId = 1; // single-tenant
  const [creandoCatalogoParaCategoria, setCreandoCatalogoParaCategoria] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>(initialCategorias);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('__sin__');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isGroupDrag, setIsGroupDrag] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Producto | null>(null);
  const [panelWidth, setPanelWidth] = useState(420);
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const [showNuevaCategoria, setShowNuevaCategoria] = useState(false);
  const [nuevaCategoriaInput, setNuevaCategoriaInput] = useState('');

  const sentinelRef = useRef<HTMLDivElement>(null);
  const dividerDragRef = useRef(false);
  const panelWidthRef = useRef(panelWidth);

  // ---------------------------------------------------------------------------
  // Debounce search
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // ---------------------------------------------------------------------------
  // Load panel width from localStorage
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const stored = localStorage.getItem('categorias-panel-width');
    if (stored) {
      const w = Number(stored);
      if (w >= 280 && w <= 600) {
        setPanelWidth(w);
        panelWidthRef.current = w;
      }
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Fetch productos
  // ---------------------------------------------------------------------------
  const fetchProductos = useCallback(async (searchVal: string, offsetVal: number, append: boolean, categoriaFiltro: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50', offset: String(offsetVal) });
      if (searchVal) params.set('search', searchVal);
      params.set('categoriaFiltro', categoriaFiltro);
      const res = await fetch(`/api/admin/productos-lista?${params}`);
      const json = await res.json();
      setProductos(prev => append ? [...prev, ...json.productos] : json.productos);
      setTotal(json.total);
      setHasMore(json.hasMore);
      setOffset(offsetVal + json.productos.length);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Carga inicial y cambios de búsqueda/categoría (un solo efecto: el segundo
  // corre también al montar, el inicial era un fetch duplicado).

  useEffect(() => {
    fetchProductos(debouncedSearch, 0, false, categoriaFiltro);
  }, [debouncedSearch, categoriaFiltro, fetchProductos]);

  // ---------------------------------------------------------------------------
  // Intersection observer — infinite scroll sentinel
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          fetchProductos(debouncedSearch, offset, true, categoriaFiltro);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoading, offset, debouncedSearch, categoriaFiltro, fetchProductos]);

  // ---------------------------------------------------------------------------
  // Divider drag
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dividerDragRef.current) return;
      const newWidth = Math.min(600, Math.max(280, e.clientX));
      setPanelWidth(newWidth);
      panelWidthRef.current = newWidth;
    };
    const onMouseUp = () => {
      if (!dividerDragRef.current) return;
      dividerDragRef.current = false;
      setIsDraggingDivider(false);
      localStorage.setItem('categorias-panel-width', String(panelWidthRef.current));
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // DnD sensors
  // ---------------------------------------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const producto = event.active.data.current?.producto as Producto;
    setActiveProduct(producto ?? null);
    setIsGroupDrag(!!producto && selectedIds.has(producto.id) && selectedIds.size > 1);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { over } = event;
    if (!over || !activeProduct) {
      setActiveProduct(null);
      setIsGroupDrag(false);
      return;
    }

    const { categoriaId, nombre } = over.data.current as { categoriaId: string; nombre: string };

    if (isGroupDrag) {
      const ids = Array.from(selectedIds);
      const productosSeleccionados = productos.filter(p => selectedIds.has(p.id));

      // Optimistic: remover todos del panel izquierdo
      setProductos(prev => prev.filter(p => !selectedIds.has(p.id)));
      setCategorias(prev =>
        prev.map(c =>
          c.id === categoriaId
            ? { ...c, total_productos: c.total_productos + ids.length }
            : c
        )
      );
      setSelectedIds(new Set());
      setActiveProduct(null);
      setIsGroupDrag(false);

      try {
        await Promise.all(
          ids.map(id =>
            fetch(`/api/productos/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ categoria: nombre }),
            })
          )
        );
      } catch {
        // Rollback
        setProductos(prev => [...productosSeleccionados, ...prev]);
        setCategorias(prev =>
          prev.map(c =>
            c.id === categoriaId
              ? { ...c, total_productos: c.total_productos - ids.length }
              : c
          )
        );
      }
    } else {
      // --- Single drag ---
      const prevCategoria = activeProduct.categoria;

      setProductos(prev =>
        categoriaFiltro === '__sin__'
          ? prev.filter(p => p.id !== activeProduct.id)
          : prev.map(p => p.id === activeProduct.id ? { ...p, categoria: nombre } : p)
      );
      setCategorias(prev =>
        prev.map(c => {
          if (c.id === categoriaId) return { ...c, total_productos: c.total_productos + 1 };
          if (prevCategoria && c.nombre === prevCategoria) return { ...c, total_productos: c.total_productos - 1 };
          return c;
        })
      );

      setActiveProduct(null);

      try {
        await fetch(`/api/productos/${activeProduct.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoria: nombre }),
        });
      } catch {
        setProductos(prev =>
          categoriaFiltro === '__sin__'
            ? [...prev, { ...activeProduct, categoria: prevCategoria }]
            : prev.map(p => p.id === activeProduct.id ? { ...p, categoria: prevCategoria } : p)
        );
        setCategorias(prev =>
          prev.map(c => {
            if (c.id === categoriaId) return { ...c, total_productos: c.total_productos - 1 };
            if (prevCategoria && c.nombre === prevCategoria) return { ...c, total_productos: c.total_productos + 1 };
            return c;
          })
        );
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Create category
  // ---------------------------------------------------------------------------
  const handleCrearCategoria = async () => {
    const nombre = nuevaCategoriaInput.trim();
    if (!nombre) return;
    const res = await fetch('/api/categorias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    });
    if (res.ok) {
      const nueva = await res.json();
      setCategorias(prev => [...prev, { ...nueva, total_productos: 0 }].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setNuevaCategoriaInput('');
      setShowNuevaCategoria(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Delete category
  // ---------------------------------------------------------------------------
  const handleEliminarCategoria = async (id: string, total_productos: number) => {
    const mensaje = total_productos === 0
      ? '¿Eliminar esta categoría?'
      : `Esta categoría tiene ${total_productos} producto(s) asignado(s). Al eliminarla, esos productos quedarán sin categoría. ¿Deseas continuar?`;
    if (!window.confirm(mensaje)) return;
    const res = await fetch(`/api/categorias/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setCategorias(prev => prev.filter(c => c.id !== id));
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div
        className="flex overflow-hidden"
        style={{ height: 'calc(100vh - 8rem)' }}
        onMouseMove={(e) => {
          if (!dividerDragRef.current) return;
          const newWidth = Math.min(600, Math.max(280, e.clientX));
          setPanelWidth(newWidth);
          panelWidthRef.current = newWidth;
        }}
      >
        {/* LEFT PANEL */}
        <div
          className="flex flex-col overflow-hidden flex-shrink-0"
          style={{ width: panelWidth }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-[var(--card)] dark:bg-[var(--background)] flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Productos</span>
              <Badge variant="secondary" className="text-xs">{total}</Badge>
            </div>
          </div>

          {/* Category filter dropdown */}
          <div className="px-3 py-2 border-b bg-[var(--card)] dark:bg-[var(--background)] flex-shrink-0">
            <select
              value={categoriaFiltro}
              onChange={e => { setCategoriaFiltro(e.target.value); setOffset(0); }}
              className="w-full h-8 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
            >
              <option value="__sin__">Sin categoría</option>
              {categorias.map(c => (
                <option key={c.id} value={c.nombre}>{c.nombre}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b bg-[var(--card)] dark:bg-[var(--background)] flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--body-subtle)]" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar código o descripción..."
                className="pl-8 h-8 text-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--body-subtle)] hover:text-[var(--body)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Product list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {productos.map(p => (
              <ProductoCard
                key={p.id}
                producto={p}
                isSelected={selectedIds.has(p.id)}
                onToggle={toggleSelected}
              />
            ))}

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} className="h-4" />

            {isLoading && (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--body-subtle)]" />
              </div>
            )}
          </div>
        </div>

        {/* DIVIDER */}
        <div
          className={`w-1 flex-shrink-0 cursor-col-resize transition-colors ${
            isDraggingDivider ? 'bg-[var(--primary)]' : 'bg-[var(--muted)] hover:bg-[var(--primary)]'
          }`}
          onMouseDown={() => {
            dividerDragRef.current = true;
            setIsDraggingDivider(true);
          }}
        />

        {/* RIGHT PANEL */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-[var(--card)] dark:bg-[var(--background)] flex-shrink-0">
            <span className="font-semibold text-sm">Categorías</span>
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs gap-1"
              onClick={() => { setShowNuevaCategoria(true); setNuevaCategoriaInput(''); }}
            >
              <Plus className="w-3.5 h-3.5" />
              Nueva categoría
            </Button>
          </div>

          {/* Nueva categoría inline form */}
          {showNuevaCategoria && (
            <div className="flex items-center gap-2 px-4 py-2 border-b bg-[var(--muted)] flex-shrink-0">
              <Input
                autoFocus
                value={nuevaCategoriaInput}
                onChange={e => setNuevaCategoriaInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCrearCategoria(); if (e.key === 'Escape') setShowNuevaCategoria(false); }}
                placeholder="Nombre de la categoría..."
                className="h-8 text-sm flex-1"
              />
              <Button size="sm" className="h-8 text-xs" onClick={handleCrearCategoria}>
                Guardar
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowNuevaCategoria(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {/* Categories grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {categorias.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--body-subtle)] gap-2">
                <Tag className="w-10 h-10 opacity-30" />
                <p className="text-sm">No hay categorías. Crea una para empezar.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                {categorias.map(c => (
                  <CategoriaCard
                    key={c.id}
                    categoria={c}
                    onDelete={(id, total) => handleEliminarCategoria(id, total)}
                    onGenerarCatalogo={(nombre) => setCreandoCatalogoParaCategoria(nombre)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <CrearCatalogoDialog
        open={creandoCatalogoParaCategoria !== null}
        onOpenChange={(open) => { if (!open) setCreandoCatalogoParaCategoria(null); }}
        empresaId={activeEmpresaId}
        categoriaInicial={creandoCatalogoParaCategoria ?? undefined}
        onCreated={() => setCreandoCatalogoParaCategoria(null)}
      />

      {/* Drag overlay */}
      <DragOverlay>
        {activeProduct && (
          <DragOverlayCard
            producto={activeProduct}
            count={isGroupDrag ? selectedIds.size : undefined}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
