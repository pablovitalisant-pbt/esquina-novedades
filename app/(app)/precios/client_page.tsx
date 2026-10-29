'use client';

import { useState, useEffect } from 'react';
import { Producto, UserSession } from '@/types';
import { ProductCard } from '@/components/ProductCard';
import { ProductDrawer } from '@/components/ProductDrawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Search, Eye, EyeOff, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { calcularMargen } from '@/lib/calcular-precio';
import { EMPRESA } from '@/lib/empresa';

// ponytail: single-tenant (empresa única, migración 018)
interface PreciosClientProps {
  session: UserSession;
}

export function PreciosClient({ session }: PreciosClientProps) {
  const [crearPrecioMayor, setCrearPrecioMayor] = useState('');
  const [crearMinimoMayor, setCrearMinimoMayor] = useState('');

  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const hasSearch = debouncedSearch.trim().length >= 2;
  const [soloStock, setSoloStock] = useState(false);
  const [soloNuevo, setSoloNuevo] = useState(false);

  const [ocultarPrecios, setOcultarPrecios] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [crearOpen, setCrearOpen] = useState(false);
  const [crearCodigo, setCrearCodigo] = useState('');
  const [crearDetalle, setCrearDetalle] = useState('');
  const [crearCosto, setCrearCosto] = useState('');
  const [crearPrcVenta, setCrearPrcVenta] = useState('');
  const [crearSaldo, setCrearSaldo] = useState('');
  const [crearStockMinimo, setCrearStockMinimo] = useState('');
  const [crearCantCaja, setCrearCantCaja] = useState('');
  const [crearLoading, setCrearLoading] = useState(false);
  const [crearFile, setCrearFile] = useState<File | null>(null);
  const [crearPreview, setCrearPreview] = useState<string | null>(null);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setSoloStock(localStorage.getItem('precios_soloStock') === 'true');
    setSoloNuevo(localStorage.getItem('precios_soloNuevo') === 'true');
    setOcultarPrecios(localStorage.getItem('ocultar_precios') === 'true');
  }, []);

  useEffect(() => { localStorage.setItem('precios_soloStock', soloStock.toString()); }, [soloStock]);
  useEffect(() => { localStorage.setItem('precios_soloNuevo', soloNuevo.toString()); }, [soloNuevo]);
  useEffect(() => { localStorage.setItem('ocultar_precios', ocultarPrecios.toString()); }, [ocultarPrecios]);

  // Fetch logic
  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      if (debouncedSearch.trim().length < 2) {
        setProductos([]);
        setLoading(false);
        return;
      }
      try {
        const queryParams = new URLSearchParams({
          ...(debouncedSearch && { search: debouncedSearch }),
          ...(soloStock && { soloStock: 'true' }),
          ...(soloNuevo && { soloNuevo: 'true' }),
        });

        const res = await fetch(`/api/productos?${queryParams.toString()}`);
        if (res.ok) {
          const { data } = await res.json();
          setProductos(data || []);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchProducts();
  }, [debouncedSearch, soloStock, soloNuevo]);

  const costoNum = crearCosto ? Number(crearCosto) : null;
  const gananciaDetalle = calcularMargen(costoNum, crearPrcVenta ? Number(crearPrcVenta) : null);
  const gananciaMayor = calcularMargen(costoNum, crearPrecioMayor ? Number(crearPrecioMayor) : null);

  const handleCrearProducto = async () => {
    if (!crearCodigo.trim()) { toast.error('Código requerido'); return; }
    if (!crearDetalle.trim()) { toast.error('Descripción requerida'); return; }
    if (!crearCosto || Number(crearCosto) <= 0) { toast.error('Costo debe ser mayor a 0'); return; }
    if (!crearPrcVenta || !Number.isInteger(Number(crearPrcVenta)) || Number(crearPrcVenta) <= 0) {
      toast.error('Precio por menor debe ser un entero mayor a 0'); return;
    }
    if (crearPrecioMayor && Number(crearPrecioMayor) >= Number(crearPrcVenta)) {
      toast.error('Precio por mayor debe ser menor al precio por menor'); return;
    }

    setCrearLoading(true);
    try {
      // 1. Crear producto — precios directos; el servidor deriva margen_pct
      const res = await fetch('/api/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: crearCodigo.trim(),
          detalle: crearDetalle.trim(),
          costo: Number(crearCosto),
          prcventa: Number(crearPrcVenta),
          precio_mayor: crearPrecioMayor ? Number(crearPrecioMayor) : null,
          minimo_mayor: crearPrecioMayor && crearMinimoMayor ? Number(crearMinimoMayor) : null,
          saldo: crearSaldo ? Number(crearSaldo) : undefined,
          stock_minimo: crearStockMinimo ? Number(crearStockMinimo) : undefined,
          cantcaja: crearCantCaja ? Number(crearCantCaja) : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Error al crear producto');
        return;
      }
      const { data } = await res.json();

      // 2. Subir imagen si hay archivo seleccionado
      if (crearFile) {
        const base64 = await fileToBase64(crearFile);
        const imgRes = await fetch('/api/productos/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigo: data.codigo, imageBase64: base64 }),
        });
        if (!imgRes.ok) {
          toast.warning('Producto creado, pero la imagen no se pudo subir. Puedes agregarla después desde el detalle del producto.');
        }
      }

      toast.success('Producto creado');
      setCrearOpen(false);
      setCrearCodigo('');
      setCrearDetalle('');
      setCrearCosto('');
      setCrearPrcVenta('');
      setCrearSaldo('');
      setCrearCantCaja('');
      setCrearPrecioMayor('');
      setCrearMinimoMayor('');
      setCrearFile(null);
      setCrearPreview(null);
      setSearch('');
      setDebouncedSearch('');
    } catch {
      toast.error('Error de red al crear producto');
    } finally {
      setCrearLoading(false);
    }
  };

  const handleProductUpdate = (updatedProduct: Producto) => {
    if (updatedProduct.activo === false) {
      // soft-delete: sale de la grilla ya renderizada sin esperar refetch
      setProductos(prev => prev.filter(p => p.id !== updatedProduct.id));
      setSelectedProduct(null);
      return;
    }
    setProductos(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    setSelectedProduct(updatedProduct);
  };

  const openDrawer = (producto: Producto) => {
    setSelectedProduct(producto);
    setDrawerOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 fade-in zoom-in-95 duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">Lista de Precios</h1>
          <button
            onClick={() => setOcultarPrecios(v => !v)}
            className="p-1.5 rounded-pill text-[var(--body-subtle)] hover:text-[var(--heading)] hover:bg-[var(--muted)] transition-colors"
            title={ocultarPrecios ? 'Mostrar precios' : 'Ocultar precios'}
          >
            {ocultarPrecios ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
          {session.rol === 'admin' && (
            <Dialog open={crearOpen} onOpenChange={(open) => {
              setCrearOpen(open);
              if (!open) { setCrearFile(null); setCrearPreview(null); }
            }}>
              <DialogTrigger
                render={
                  <Button className="ml-auto rounded-full" size="sm">
                    <Plus className="w-4 h-4 mr-1" /> Agregar producto
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Nuevo producto</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <label className="text-sm font-medium">Código *</label>
                    <Input data-testid="crear-codigo" value={crearCodigo} onChange={e => setCrearCodigo(e.target.value)} placeholder="Ej: BZ-001" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Descripción *</label>
                    <Input data-testid="crear-detalle" value={crearDetalle} onChange={e => setCrearDetalle(e.target.value)} placeholder="Nombre del producto" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Costo *</label>
                    <Input data-testid="crear-costo" type="number" step="0.01" min="0.01" value={crearCosto} onChange={e => setCrearCosto(e.target.value)} placeholder="0.00" />
                    <p className="text-xs text-[var(--body-subtle)] mt-1">Costo por unidad</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Precio por menor *</label>
                    <Input data-testid="crear-prcventa" type="number" step="1" min="1" value={crearPrcVenta} onChange={e => setCrearPrcVenta(e.target.value)} placeholder="2500" />
                    <p className="text-xs text-[var(--body-subtle)] mt-1">Precio por unidad en CLP</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Precio por mayor (opcional)</label>
                    <Input data-testid="crear-precio-mayor" type="number" step="1" min="1" value={crearPrecioMayor} onChange={e => setCrearPrecioMayor(e.target.value)} placeholder="Sin precio por mayor" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Por mayor en tienda online desde (unidades)</label>
                    <Input data-testid="crear-minimo-mayor" type="number" step="1" min="1" value={crearMinimoMayor} onChange={e => setCrearMinimoMayor(e.target.value)} placeholder="3" disabled={!crearPrecioMayor} />
                    <p className="text-xs text-[var(--body-subtle)] mt-1">Cantidad mínima para aplicar el precio por mayor en la tienda</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-[var(--body)]">Ganancia por menor</p>
                      <p data-testid="ganancia-detalle" className="text-sm font-semibold">{gananciaDetalle === null ? '—' : `${gananciaDetalle}%`}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--body)]">Ganancia por mayor</p>
                      <p data-testid="ganancia-mayor" className="text-sm font-semibold">{gananciaMayor === null ? '—' : `${gananciaMayor}%`}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">¿Cuántas unidades hay en cada caja?</label>
                    <Input type="number" step="1" min="1" value={crearCantCaja} onChange={e => setCrearCantCaja(e.target.value)} placeholder="12" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">¿Cuántas unidades están ingresando?</label>
                    <Input type="number" step="1" min="0" value={crearSaldo} onChange={e => setCrearSaldo(e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <label htmlFor="crear-stock-minimo" className="text-sm font-medium">La alerta de Stock Bajo se activará cuando queden ¿cuántas unidades?</label>
                    <Input id="crear-stock-minimo" type="number" step="1" min="0" value={crearStockMinimo} onChange={e => setCrearStockMinimo(e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Imagen del producto</label>
                    <div className="mt-1 flex items-center gap-3">
                      {crearPreview && (
                        // eslint-disable-next-line @next/next/no-img-element -- preview local de FileReader antes de subir a Cloudinary
                        <img src={crearPreview} alt="Preview" className="w-16 h-16 rounded-lg object-cover border" />
                      )}
                      <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border)] border-[var(--border)]700 hover:bg-[var(--muted)] dark:hover:bg-[var(--muted)] transition-colors">
                        {crearPreview ? 'Cambiar imagen' : 'Seleccionar imagen'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 5 * 1024 * 1024) {
                              toast.error('La imagen no puede superar los 5 MB');
                              return;
                            }
                            setCrearFile(file);
                            setCrearPreview(URL.createObjectURL(file));
                          }}
                        />
                      </label>
                    </div>
                    <p className="text-xs text-[var(--body)] mt-1">JPEG, PNG o WebP. Máximo 5 MB.</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => {
                    setCrearOpen(false);
                    setCrearFile(null);
                    setCrearPreview(null);
                  }}>Cancelar</Button>
                  <Button onClick={handleCrearProducto} disabled={crearLoading}>
                    {crearLoading ? 'Creando...' : 'Crear producto'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="sticky top-16 md:top-20 z-40 bg-[var(--background)]/80 backdrop-blur-xl py-2 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--body-subtle)]" />
          <Input
            type="text"
            placeholder="Buscar por código o descripción..."
            className="pl-10 h-12 text-base shadow-xs border-[var(--border)] focus-visible:ring-[var(--ring)]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap gap-4 mt-4">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded-sm border-[var(--border)] text-[var(--primary)] focus:ring-[var(--ring)]" checked={soloStock} onChange={(e) => setSoloStock(e.target.checked)} />
            Solo con stock ✓
          </label>
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded-sm border-[var(--border)] text-[var(--primary)] focus:ring-[var(--ring)]" checked={soloNuevo} onChange={(e) => setSoloNuevo(e.target.checked)} />
            Solo nuevos ✨
          </label>
        </div>
      </div>

      {loading && hasSearch ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-pulse">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-36 bg-[var(--muted)] rounded-card"></div>
          ))}
        </div>
      ) : !hasSearch ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="text-4xl"></div>
          <p className="text-[var(--body)] font-medium">Busca un producto o descripción</p>
          <p className="text-[var(--body-subtle)] text-sm">Ingresa al menos 2 caracteres para ver resultados</p>
        </div>
      ) : productos.length === 0 ? (
        <div className="text-center py-12 text-[var(--body)]">
          No se encontraron productos.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-12">
          {productos.map(p => (
            <ProductCard
              key={p.id}
              producto={p}
              empresaSlug={EMPRESA.slug}
              onClick={openDrawer}
              ocultarPrecios={ocultarPrecios}
              rol={session?.rol}
            />
          ))}
        </div>
      )}

      <ProductDrawer
        producto={selectedProduct}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        session={session}
        onUpdated={handleProductUpdate}
        ocultarPrecios={ocultarPrecios}
      />
    </div>
  );
}
