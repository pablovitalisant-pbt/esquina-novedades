'use client';

import { useState, useEffect, useRef } from 'react';
import { UbicacionBodegaAgrupada, type SessionProp } from '@/types';
import { BodegaCard } from '@/components/BodegaCard';
import { Input } from '@/components/ui/input';
import { Search, Share2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import { toast } from 'sonner';
import { useShareImage } from '@/hooks/useShareImage';
import { EMPRESA } from '@/lib/empresa';

export function BodegaClient({ session }: { session: SessionProp }) {
  const { shareImage } = useShareImage();
  const activeEmpresaId = 1; // single-tenant
  const [ubicaciones, setUbicaciones] = useState<UbicacionBodegaAgrupada[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const hasSearch = search.trim().length >= 2;
  const [soloStock, setSoloStock] = useState(false);
  const [soloNuevo, setSoloNuevo] = useState(false);

  const [selectedUbi, setSelectedUbi] = useState<UbicacionBodegaAgrupada | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const empresaSlug = EMPRESA.slug;

  // Autobocus on search input for fast warehouse operations
  useEffect(() => {
    if (searchInputRef.current) searchInputRef.current.focus();
  }, []);

  useEffect(() => {
    setSoloStock(localStorage.getItem('bodega_soloStock') === 'true');
    setSoloNuevo(localStorage.getItem('bodega_soloNuevo') === 'true');
  }, []);

  useEffect(() => { localStorage.setItem('bodega_soloStock', soloStock.toString()); }, [soloStock]);
  useEffect(() => { localStorage.setItem('bodega_soloNuevo', soloNuevo.toString()); }, [soloNuevo]);

  // Instant search - no debounce needed if backend is fast, but we'll debounce 250ms internally to save DB load
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (search.trim().length < 2) {
        setUbicaciones([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const queryParams = new URLSearchParams({
          empresa: activeEmpresaId.toString(),
          ...(search && { search }),
          ...(soloStock && { soloStock: 'true' }),
          ...(soloNuevo && { soloNuevo: 'true' }),
        });

        const res = await fetch(`/api/ubicaciones?${queryParams.toString()}`);
        if (res.ok) {
          const { data } = await res.json();
          setUbicaciones(data || []);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }, 250);
    
    return () => clearTimeout(timer);
  }, [search, soloStock, soloNuevo]);

  const openDrawer = (ubi: UbicacionBodegaAgrupada) => {
    setSelectedUbi(ubi);
    setDrawerOpen(true);
  };

  const handleUbicacionSaved = (updated: UbicacionBodegaAgrupada) => {
    setSelectedUbi(updated);
    setUbicaciones(prev => prev.map(u => u.codigo === updated.codigo ? updated : u));
  };
  return (
    <div className="flex flex-col gap-6 fade-in zoom-in-95 duration-200">
      
      <div className="sticky top-16 md:top-20 z-40 bg-[var(--background)]/95 backdrop-blur-xl py-3 -mx-4 px-4 sm:mx-0 sm:px-0 border-b md:border-none shadow-sm md:shadow-none">
        <label className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider mb-2 block">Búsqueda Rápida</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 text-[var(--primary)]" />
          <Input 
            ref={searchInputRef}
            type="text" 
            placeholder="Buscar ubicación o código..." 
            className="pl-12 h-14 text-sm font-medium shadow-md border-[var(--primary)]/30 bg-[var(--card)] focus-visible:ring-[var(--ring)]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-4 mt-3">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--ring)]" checked={soloStock} onChange={(e) => setSoloStock(e.target.checked)} />
            Solo con stock ✓
          </label>
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--ring)]" checked={soloNuevo} onChange={(e) => setSoloNuevo(e.target.checked)} />
            Solo nuevos ✨
          </label>
        </div>
        {hasSearch && (
          <div className="text-xs text-[var(--body)] font-medium mt-3 text-right">
            Mostrando {ubicaciones.length} ubicaciones
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-12">
         {loading && hasSearch ? (
           <div className="col-span-full py-8 text-center text-[var(--body)] animate-pulse">Buscando...</div>
         ) : !hasSearch ? (
           <div className="col-span-full flex flex-col items-center justify-center py-16 text-center gap-3">
             <div className="text-4xl"></div>
             <p className="text-[var(--body)] font-medium">Busca un producto o ubicación</p>
             <p className="text-[var(--body-subtle)] text-sm">Ingresa al menos 2 caracteres para ver resultados</p>
           </div>
         ) : ubicaciones.length === 0 ? (
           <div className="col-span-full text-center py-12 text-[var(--body)]">Ninguna ubicación coincide.</div>
         ) : (
           ubicaciones.map(u => (
             <BodegaCard
               key={u.codigo}
               ubicacion={u}
               empresaSlug={empresaSlug}
               onClick={openDrawer}
             />
           ))
         )}
      </div>

      {/* Edit Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-screen h-screen sm:w-[500px] sm:h-full max-w-full overflow-y-auto flex flex-col p-0">
          <div className="p-5 flex flex-col h-full overflow-y-auto">
            {selectedUbi && (
              <>
                <SheetHeader className="mb-6 border-b pb-4">
                  <SheetTitle className="text-2xl font-black text-[var(--primary)] leading-none">
                    {selectedUbi.codigo}
                  </SheetTitle>
                  <SheetDescription className="text-left text-sm font-medium mt-1 text-[var(--body)]">
                    {selectedUbi.detalle || 'Sin descripción'}
                  </SheetDescription>
                  <div className="text-xs text-[var(--body)] mt-2">
                  Sistema: <span className="font-semibold text-[var(--heading)]">{selectedUbi.saldo}</span>
                </div>
                </SheetHeader>

                <div className="space-y-6">
                 {/* Image */}
                <div className="w-full h-48 relative rounded-lg overflow-hidden bg-[var(--muted)] border">
                  <ImageWithFallback 
                    src={selectedUbi.producto_imagen_url} 
                    codigo={selectedUbi.codigo} 
                    fill
                    ancho={1200}
                    className="object-contain"
                  />
                  {selectedUbi.producto_imagen_url && (
                    <button
                      onClick={() => shareImage(
                        selectedUbi.producto_imagen_url || '',
                        `${selectedUbi.codigo}.jpg`,
                        `${selectedUbi.codigo} — ${selectedUbi.detalle || ''}`
                      )}
                      className="absolute top-2 right-2 bg-[var(--card)]/80 backdrop-blur-sm rounded-full p-2 shadow-md hover:bg-[var(--card)] transition-colors z-10"
                    >
                      <Share2 className="w-4 h-4 text-[var(--body)]" />
                    </button>
                  )}
                </div>

                {/* Editor de ubicación (1 producto = 1 ubicación) */}
                <UbicacionEditor
                  ubicacion={selectedUbi}
                  onSaved={handleUbicacionSaved}
                  session={session}
                />
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function UbicacionEditor({ ubicacion, onSaved, session }: { ubicacion: UbicacionBodegaAgrupada; onSaved: (updated: UbicacionBodegaAgrupada) => void; session: SessionProp }) {
  const [ubicacionStr, setUbicacionStr] = useState(ubicacion.ubicacion || '');
  const [fisicoCajas, setFisicoCajas] = useState(() => ubicacion.fisico_cajas != null ? ubicacion.fisico_cajas.toString() : '');
  const [fisicoUnidades, setFisicoUnidades] = useState(() => ubicacion.fisico_unidades != null && ubicacion.fisico_unidades > 0 ? ubicacion.fisico_unidades.toString() : '');
  const [obs, setObs] = useState(ubicacion.observaciones || '');
  const [saving, setSaving] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  // Conciliación de stock: admin-only. Para vendedor/bodeguero
  // el botón no se muestra (no solo deshabilitado). El fetch de conciliación
  // SIEMPRE va al backend (POST /api/bodega/conciliaciones) — es admin-only y online.
  const isAdmin = session?.user?.rol === 'admin';
  const showConciliacion = isAdmin;
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  useEffect(() => {
    setUbicacionStr(ubicacion.ubicacion || '');
    setFisicoCajas(ubicacion.fisico_cajas != null ? ubicacion.fisico_cajas.toString() : '');
    setFisicoUnidades(ubicacion.fisico_unidades != null && ubicacion.fisico_unidades > 0 ? ubicacion.fisico_unidades.toString() : '');
    setObs(ubicacion.observaciones || '');
  }, [ubicacion]);

  const cajas = fisicoCajas === '' ? null : parseInt(fisicoCajas);
  const unidades = fisicoUnidades === '' ? 0 : parseInt(fisicoUnidades);
  const fisicoTotal = cajas !== null ? (cajas * ubicacion.cantcaja) + unidades : null;
  const diferencia = fisicoTotal !== null ? fisicoTotal - ubicacion.saldo : null;
  const difCajas = diferencia !== null ? Math.trunc(diferencia / ubicacion.cantcaja) : null;
  const difResto = diferencia !== null ? diferencia % ubicacion.cantcaja : null;

  const difLabel = diferencia === null
    ? '—'
    : diferencia === 0
      ? 'Cuadrado ✓'
      : difCajas === 0
        ? `${difResto} u`
        : difResto === 0
          ? `${difCajas} cj`
          : `${difCajas} cj + ${difResto} u`;

  const difColor = diferencia === null
    ? 'text-[var(--body-subtle)]'
    : diferencia === 0
      ? 'text-[var(--success)]'
      : diferencia < 0
        ? 'text-[var(--destructive)]'
        : 'text-[var(--success)]';

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ubicacion: ubicacionStr,
        fisico_cajas: cajas,
        fisico_unidades: unidades,
        observaciones: obs,
      };

      const res = await fetch(`/api/ubicaciones/codigo/${ubicacion.codigo}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Error guardando');
      const { data } = await res.json();
      onSaved({ ...ubicacion, ...data, ubicacion: payload.ubicacion, observaciones: payload.observaciones });
      toast.success('Ubicación guardada');
    } catch {
      toast.error('No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  // Conciliación: sobrescribe productos.saldo con el conteo físico. Requiere
  // confirmación explícita (no reversible con un clic). Siempre por fetch.
  const handleConciliar = async () => {
    if (fisicoTotal === null) return;
    const ok = window.confirm('¿Confirmar conciliación? El stock del sistema se sobrescribirá con el conteo físico.');
    if (!ok) return;

    setReconciling(true);
    try {
      const res = await fetch('/api/bodega/conciliaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: ubicacion.codigo,
          fisico_cajas: cajas,
          fisico_unidades: unidades,
          observaciones: obs,
        }),
      });
      if (!res.ok) throw new Error('Error conciliando');
      const { data } = await res.json();
      onSaved({
        ...ubicacion,
        saldo: data.saldo_nuevo,
        fisico: fisicoTotal,
        fisico_cajas: cajas,
        fisico_unidades: unidades,
        diferencia: 0,
      });
      toast.success(`Stock actualizado: ${data.saldo_anterior} → ${data.saldo_nuevo} unidades`);
    } catch {
      toast.error('No se pudo actualizar el stock');
    } finally {
      setReconciling(false);
    }
  };

  const saldoCajas = Math.floor(ubicacion.saldo / ubicacion.cantcaja);
  const saldoResto = ubicacion.saldo % ubicacion.cantcaja;

  return (
    <div className="space-y-3">
      {/* Saldo sistema */}
      <div className="bg-[--card] p-3 rounded-lg border text-center">
        <div className="text-[10px] text-[var(--body-subtle)] uppercase tracking-wide">Sistema</div>
        <div className="text-2xl font-bold mt-0.5">{saldoCajas} cj {saldoResto > 0 ? `+ ${saldoResto} u` : ''}</div>
        <div className="text-xs text-[var(--body-subtle)] mt-0.5">{ubicacion.saldo} unidades · {ubicacion.cantcaja} u/caja</div>
      </div>

      {/* Conteo físico */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-bold">¿Cuántas cajas hay físicamente?</Label>
          <Input
            type="number"
            min="0"
            className="h-12 text-xl font-bold text-center"
            placeholder="0"
            value={fisicoCajas}
            onChange={e => setFisicoCajas(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-bold">¿Cuántas unidades sueltas hay?</Label>
          <Input
            type="number"
            min="0"
            className="h-12 text-xl font-bold text-center"
            placeholder="0"
            value={fisicoUnidades}
            onChange={e => setFisicoUnidades(e.target.value)}
          />
        </div>
      </div>

      {/* Preview diferencia */}
      {fisicoTotal !== null && (
        <div className={`p-3 rounded-lg border text-center ${diferencia === 0 ? 'bg-[var(--success)]/10 border-[var(--success)]/30' : diferencia! < 0 ? 'bg-[var(--destructive)]/10 border-[var(--destructive)]/30' : 'bg-[var(--success)]/10 border-[var(--success)]/30'}`}>
          <div className="text-[10px] text-[var(--body-subtle)] uppercase tracking-wide">Diferencia</div>
          <div className={`text-xl font-bold mt-0.5 ${difColor}`}>{difLabel}</div>
          <div className="text-xs text-[var(--body-subtle)] mt-0.5">{fisicoTotal} u en bodega vs {ubicacion.saldo} u en sistema</div>
        </div>
      )}

      {/* Conciliación de stock (flag + admin). Deshabilitado sin conexión. */}
      {showConciliacion && (
        <div className="space-y-1">
          <Button
            className="w-full font-bold h-11"
            variant="outline"
            onClick={handleConciliar}
            disabled={reconciling || !online || fisicoTotal === null}
          >
            {reconciling ? 'Actualizando...' : 'Actualizar Stock'}
          </Button>
          {!online && (
            <p className="text-xs text-center text-[var(--destructive)]">
              Sin conexión — no se puede actualizar el stock real
            </p>
          )}
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Código de ubicación</Label>
        <Input className="font-mono uppercase" value={ubicacionStr} onChange={e => setUbicacionStr(e.target.value.toUpperCase())} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Observaciones</Label>
        <Input placeholder="Ej: Cajas mojadas..." value={obs} onChange={e => setObs(e.target.value)} />
      </div>
      <Button className="w-full font-bold h-11" onClick={handleSave} disabled={saving}>
        {saving ? 'Guardando...' : 'Guardar ubicación'}
      </Button>
    </div>
  );
}
