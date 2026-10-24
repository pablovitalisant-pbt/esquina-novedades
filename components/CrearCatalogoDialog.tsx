'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface CrearCatalogoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaId: number;
  categoriaInicial?: string;
  onCreated?: () => void;
}

export function CrearCatalogoDialog({
  open,
  onOpenChange,
  empresaId,
  categoriaInicial,
  onCreated,
}: CrearCatalogoDialogProps) {
  const [newTitle, setNewTitle] = useState('');
  const [newSoloStock, setNewSoloStock] = useState(true);
  const [newSoloNuevo, setNewSoloNuevo] = useState(false);
  const [newSoloNuevoTopN, setNewSoloNuevoTopN] = useState(1);
  const [newMostrarStock, setNewMostrarStock] = useState(false);
  const [newMostrarPrecio, setNewMostrarPrecio] = useState(true);
  const [newMargen, setNewMargen] = useState(0);
  const [newPalabrasIncluir, setNewPalabrasIncluir] = useState('');
  const [newPalabrasExcluir, setNewPalabrasExcluir] = useState('');
  const [newCategoria, setNewCategoria] = useState('');
  const [categoriasDisponibles, setCategoriasDisponibles] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/categorias')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setCategoriasDisponibles(data.map((c: { nombre: string }) => c.nombre));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      setNewCategoria(categoriaInicial ?? '');
    }
  }, [open, categoriaInicial]);

  const resetForm = () => {
    setNewTitle('');
    setNewSoloStock(false);
    setNewSoloNuevo(false);
    setNewSoloNuevoTopN(1);
    setNewMostrarStock(false);
    setNewMostrarPrecio(true);
    setNewMargen(0);
    setNewPalabrasIncluir('');
    setNewPalabrasExcluir('');
    setNewCategoria('');
  };

  const handleCreate = async () => {
    // Crear catálogo requiere conexión (el slug de URL pública se genera
    // server-side con chequeo de unicidad — replicarlo offline arriesga
    // colisión de slug entre catálogos).
    if (!navigator.onLine) {
      toast.error('Crear un catálogo nuevo requiere conexión a internet.');
      return;
    }
    try {
      const res = await fetch('/api/catalogos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresaId,
          titulo: newTitle,
          descripcion: null,
          mostrar_precio: newMostrarPrecio,
          margen_precio: newMargen,
          solo_stock: newSoloStock,
          mostrar_stock: newMostrarStock,
          solo_nuevo: newSoloNuevo,
          solo_nuevo_top_n: newSoloNuevo ? newSoloNuevoTopN : 1,
          palabras_incluir: newPalabrasIncluir,
          palabras_excluir: newPalabrasExcluir,
          categoria: newCategoria || null,
        }),
      });
      if (res.ok) {
        toast.success('Catálogo creado');
        resetForm();
        onCreated?.();
        onOpenChange(false);
      } else {
        throw new Error();
      }
    } catch {
      toast.error('No se pudo crear el catálogo');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full sm:h-auto sm:max-w-lg sm:max-h-[90vh] sm:mx-4 overflow-y-auto p-5 rounded-none sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>Nuevo Catálogo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Nombre de Cliente</label>
            <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Ej: Ofertas Mayo 2026" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Categoría (Opcional)</label>
            <select
              value={newCategoria}
              onChange={e => setNewCategoria(e.target.value)}
              className="w-full h-9 rounded-md border border-[var(--border)] border-[var(--border)]700 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] bg-[var(--muted)]900"
            >
              <option value="">Sin filtro de categoría</option>
              {categoriasDisponibles.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-semibold text-[var(--body)] dark:text-[var(--body)]">Filtros de productos</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={newSoloStock} onChange={e => setNewSoloStock(e.target.checked)} className="w-4 h-4 rounded" />
              Solo productos con stock
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={newMostrarStock} onChange={e => setNewMostrarStock(e.target.checked)} className="w-4 h-4 rounded" />
              Mostrar inventario disponible
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer flex-wrap">
              <input type="checkbox" checked={newSoloNuevo} onChange={e => setNewSoloNuevo(e.target.checked)} className="w-4 h-4 rounded" />
              Solo últimos{newSoloNuevo && (
                <input
                  type="number"
                  aria-label="top n"
                  className="w-14 h-6 rounded border border-[var(--border)] border-[var(--border)]700 text-center text-sm px-1 mx-0.5"
                  min={1}
                  max={99}
                  value={newSoloNuevoTopN}
                  onChange={e => setNewSoloNuevoTopN(parseInt(e.target.value) || 1)}
                  onClick={e => e.stopPropagation()}
                />
              )} ingresos llegados a Zofri
            </label>
            <div className="space-y-1">
              <label className="text-sm font-medium">Productos a incluir</label>
              <Input value={newPalabrasIncluir} onChange={e => setNewPalabrasIncluir(e.target.value)} placeholder="Ej: vidrio, licuadora" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Productos a excluir</label>
              <Input value={newPalabrasExcluir} onChange={e => setNewPalabrasExcluir(e.target.value)} placeholder="Ej: NAVIDAD, (ANIL)" />
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-semibold text-[var(--body)] dark:text-[var(--body)]">Configuración de precio</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={newMostrarPrecio} onChange={e => setNewMostrarPrecio(e.target.checked)} className="w-4 h-4 rounded" />
              Mostrar precio en el catálogo
            </label>
            {newMostrarPrecio && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Margen sobre costo (%)</label>
                <Input
                  type="number"
                  min="0"
                  max="500"
                  value={newMargen}
                  onFocus={e => e.target.select()}
                  onChange={e => setNewMargen(parseFloat(e.target.value) || 0)}
                  placeholder="Ej: 30"
                />
                <p className="text-xs text-[var(--body)]">Precio = Costo × (1 + margen%)</p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={!newTitle.trim()}>Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
