'use client';

import { useState, useRef, useEffect } from 'react';
import { Producto, UserSession } from '@/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { ImageWithFallback } from './ImageWithFallback';
import { formatCLP } from '@/lib/utils';
import { toast } from 'sonner';
import { ClipboardList, Share2, Pencil, X, Trash2 } from 'lucide-react';
import { useShareImage } from '@/hooks/useShareImage';
import { Badge } from '@/components/ui/badge';
import { AgregarANotaVentaModal } from '@/components/AgregarANotaVentaModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

interface ProductDrawerProps {
  producto: Producto | null;
  empresaNombre: string;
  session: UserSession;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (updatedProduct: Producto) => void;
  ocultarPrecios?: boolean;
  mostrarPrecioEnShare?: boolean;
}

export function ProductDrawer({ producto, empresaNombre, session, open, onOpenChange, onUpdated, ocultarPrecios, mostrarPrecioEnShare = false }: ProductDrawerProps) {
  void empresaNombre;
  const { shareImage } = useShareImage();
  const [isEditing, setIsEditing] = useState(false);
  const [prcVenta, setPrcVenta] = useState('');
  const [prcMinimo, setPrcMinimo] = useState('');
  const [categoria, setCategoria] = useState(producto?.categoria ?? '');
  const [categoriasDisponibles, setCategoriasDisponibles] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showPrenota, setShowPrenota] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const skipNextSync = useRef(false);
  const empresaSlug = 'bazar-naty';

  // BUG-019 fix: estado para edición completa de producto
  const [editCosto, setEditCosto] = useState('');
  const [editMargenPct, setEditMargenPct] = useState('');
  const [editDetalle, setEditDetalle] = useState('');
  const [editUmed, setEditUmed] = useState('');
  const [editCantCaja, setEditCantCaja] = useState('');
  const [editPesoCaja, setEditPesoCaja] = useState('');
  const [editCubiCaja, setEditCubiCaja] = useState('');
  const [editEsNuevo, setEditEsNuevo] = useState(false);
  const [editStockMinimo, setEditStockMinimo] = useState('');
  // Slice cambiar-codigo: codigo editable por admin (endpoint dedicado, propaga
  // a ubicaciones_bodega / catalogo_precio_override / prenota_items activas).
  const [isEditingCodigo, setIsEditingCodigo] = useState(false);
  const [codigoNuevo, setCodigoNuevo] = useState('');
  const [isSavingCodigo, setIsSavingCodigo] = useState(false);
  // Soft-delete: el modal exige escribir el codigo exacto para confirmar.
  const [showEliminar, setShowEliminar] = useState(false);
  const [codigoConfirmacion, setCodigoConfirmacion] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const canEditPrices = ['admin'].includes(session.rol);
  const isAdmin = session.rol === 'admin';

  // Precio calculado en vivo (mismo patrón que S1)
  const precioCalculado = editCosto && editMargenPct
    ? Math.round(Number(editCosto) * (1 + Number(editMargenPct) / 100) * 100) / 100
    : null;

  useEffect(() => {
    fetch('/api/categorias')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setCategoriasDisponibles(data.map((c: any) => c.nombre));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (producto) {
      setCategoria(producto.categoria ?? '');
      setEditStockMinimo(producto.stock_minimo?.toString() ?? '');
      setEditCosto(producto.costo?.toString() ?? '');
      setEditMargenPct(producto.margen_pct != null ? String(Number(producto.margen_pct)) : '');
      setEditDetalle(producto.detalle ?? '');
      setEditUmed(['U', 'SET'].includes(producto.umed) ? producto.umed : 'U');
      setEditCantCaja(producto.cantcaja.toString());
      setEditPesoCaja(producto.pesocaja.toString());
      setEditCubiCaja(producto.cubicaja.toString());
      setEditEsNuevo(producto.es_nuevo);
      setPrcVenta(producto.prcventa.toString());
      setPrcMinimo(producto.prcminimo?.toString() ?? '');
      setCodigoNuevo(producto.codigo);
      setIsEditingCodigo(false);
    }
  }, [producto]);

  useEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }
    setCurrentImageUrl(producto?.imagen_url || null);
  }, [producto]);

  // Sync state when product opens
  const handleOpenStatus = (isOpen: boolean) => {
    if (isOpen && producto) {
      setPrcVenta(producto.prcventa.toString());
      setPrcMinimo(producto.prcminimo?.toString() ?? '');
      setCategoria(producto.categoria ?? '');
      setEditCosto(producto.costo?.toString() ?? '');
      setEditMargenPct(producto.margen_pct != null ? String(Number(producto.margen_pct)) : '');
      setEditDetalle(producto.detalle ?? '');
      setEditUmed(['U', 'SET'].includes(producto.umed) ? producto.umed : 'U');
      setEditCantCaja(producto.cantcaja.toString());
      setEditPesoCaja(producto.pesocaja.toString());
      setEditCubiCaja(producto.cubicaja.toString());
      setEditEsNuevo(producto.es_nuevo);
      setEditStockMinimo(producto.stock_minimo?.toString() ?? '');
      setIsEditing(false);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
    onOpenChange(isOpen);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Solo se aceptan JPG, PNG o WEBP');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagen debe ser menor a 5MB');
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !producto) return;
    setIsUploading(true);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
      });
      reader.readAsDataURL(selectedFile);
      const base64Data = await base64Promise;

      const res = await fetch('/api/productos/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productoId: producto.id,
          imageBase64: base64Data,
          codigo: producto.codigo,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al subir imagen');
      }

      const { imagen_url } = await res.json();

      skipNextSync.current = true;
      setCurrentImageUrl(imagen_url);
      onUpdated({ ...producto, imagen_url });
      toast.success('Imagen actualizada con éxito');
      setPreviewUrl(null);
      setSelectedFile(null);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsUploading(false);
    }
  };

  // BUG-019 fix: template literal escapado y PUT generalizado con whitelist
  const handleSaveProduct = async () => {
    if (!producto) return;
    setIsSaving(true);

    const body: Record<string, any> = {};

    if (editCosto) body.costo = Number(editCosto);
    if (editMargenPct) body.margen_pct = Number(editMargenPct);
    if (prcVenta) body.prcventa = Number(prcVenta);
    if (prcMinimo) body.prcminimo = Number(prcMinimo) || null;
    if (editDetalle) body.detalle = editDetalle;
    if (editUmed) body.umed = editUmed;
    body.cantcaja = Number(editCantCaja);
    body.pesocaja = Number(editPesoCaja);
    body.cubicaja = Number(editCubiCaja);
    body.es_nuevo = editEsNuevo;
    if (editStockMinimo) body.stock_minimo = Number(editStockMinimo);
    body.categoria = categoria || null;

    try {
      const res = await fetch(`/api/productos/${producto.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al guardar');
      }

      const { data } = await res.json();
      onUpdated(data);
      toast.success('Producto actualizado');
      setIsEditing(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCategoriaChange = async (valor: string) => {
    if (!producto) return;
    setCategoria(valor);
    try {
      const res = await fetch(`/api/productos/${producto.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria: valor || null }),
      });
      if (!res.ok) throw new Error('Error actualizando categoria');
      const { data } = await res.json();
      onUpdated(data);
      toast.success('Categoria actualizada');
    } catch {
      toast.error('No se pudo actualizar la categoria');
    }
  };

  const handleSaveCodigo = async () => {
    if (!producto) return;
    setIsSavingCodigo(true);
    try {
      const res = await fetch(`/api/productos/${producto.id}/cambiar-codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo_nuevo: codigoNuevo }),
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'No se pudo cambiar el código');

      onUpdated(payload.data);
      toast.success(payload.message || 'Código actualizado');
      setIsEditingCodigo(false);
    } catch (error: any) {
      // El servidor manda el mensaje final (409 duplicado, 400 igual al actual).
      // Se muestra tal cual — el useEffect sobre [producto] no corre en fallo,
      // asi que el input queda abierto para corregir.
      toast.error(error.message);
    } finally {
      setIsSavingCodigo(false);
    }
  };

  const handleEliminar = async () => {
    if (!producto) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/productos/${producto.id}/eliminar`, { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'No se pudo eliminar el producto');

      setShowEliminar(false);
      onUpdated(payload.data);
      toast.success(payload.message || 'Producto eliminado');
      onOpenChange(false);
    } catch (error: any) {
      // El backend distingue 409 (tiene stock) de 400 (ya eliminado) en el
      // mensaje; se muestra tal cual para que el usuario sepa que hacer.
      toast.error(error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!producto) return null;

  // Texto a compartir junto a la imagen: solo el precio CLP. Sin precio/oculto → undefined.
  const armarTextoCompartir = () => {
    if (ocultarPrecios || producto.prcventa <= 0) return undefined;
    return formatCLP(producto.prcventa);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenStatus}>
      <SheetContent className="w-screen h-screen sm:w-[500px] sm:h-full max-w-full overflow-y-auto flex flex-col p-0">
        <div className="p-5 flex flex-col h-full overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-left font-mono text-[var(--body)] flex items-center gap-2 flex-wrap">
              {isEditingCodigo ? (
                <>
                  <Input
                    data-testid="input-codigo"
                    value={codigoNuevo}
                    onChange={e => setCodigoNuevo(e.target.value)}
                    className="h-8 w-40 font-mono text-sm"
                    aria-label="Nuevo codigo"
                  />
                  <Button
                    data-testid="guardar-codigo-btn"
                    size="sm"
                    className="h-8"
                    onClick={handleSaveCodigo}
                    disabled={isSavingCodigo}
                  >
                    {isSavingCodigo ? 'Guardando...' : 'Guardar'}
                  </Button>
                  <Button
                    data-testid="cancelar-codigo-btn"
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => { setIsEditingCodigo(false); setCodigoNuevo(producto.codigo); }}
                  >
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <span>{producto.codigo}</span>
                  {editEsNuevo && <Badge variant="outline" className="text-xs">Nuevo</Badge>}
                  {isAdmin && (
                    <button
                      data-testid="editar-codigo-btn"
                      onClick={() => setIsEditingCodigo(true)}
                      className="p-1 rounded-pill text-[var(--body-subtle)] hover:text-[var(--heading)] hover:bg-[var(--muted)] transition-colors"
                      title="Editar codigo"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </SheetTitle>
            <SheetDescription className="text-left text-base text-foreground font-medium">
              {isEditing ? (
                <Input value={editDetalle} onChange={e => setEditDetalle(e.target.value)} placeholder="Descripcion" />
              ) : (
                producto.detalle
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6">
          {/* Main Image */}
          <div className="w-full aspect-square relative rounded-card overflow-hidden bg-[var(--muted)] border border-[var(--border)]">
            <ImageWithFallback
              src={currentImageUrl || producto.imagen_url}
              codigo={producto.codigo}
              empresaSlug={empresaSlug}
              fill
              className="object-contain"
            />
            {session.rol !== 'bodeguero' && (
              <button
                onClick={() => setShowPrenota(true)}
                className="absolute top-2 left-2 bg-white/80 dark:bg-[var(--muted)]/80 backdrop-blur-sm rounded-full p-2 shadow-md hover:bg-white dark:hover:bg-[var(--muted)] transition-colors z-10"
              >
                <ClipboardList className="w-4 h-4 text-[var(--body)] dark:text-[var(--body)]" />
              </button>
            )}
            {(currentImageUrl || producto.imagen_url) && (
              <button
                aria-label="Compartir imagen"
                onClick={() => shareImage(
                  currentImageUrl || producto.imagen_url || '',
                  `${producto.codigo}.jpg`,
                  `${producto.codigo} — ${producto.detalle || ''}`,
                  mostrarPrecioEnShare ? armarTextoCompartir() : undefined
                )}
                className="absolute top-2 right-2 bg-white/80 dark:bg-[var(--muted)]/80 backdrop-blur-sm rounded-full p-2 shadow-md hover:bg-white dark:hover:bg-[var(--muted)] transition-colors z-10"
              >
                <Share2 className="w-4 h-4 text-[var(--body)] dark:text-[var(--body)]" />
              </button>
            )}
          </div>

          {/* Logistics Data */}
          <div className="grid grid-cols-2 gap-4 bg-[var(--muted)] p-4 rounded-card">
            <div>
              <p className="text-xs text-[var(--body)] mb-1">Stock</p>
              <p className="font-semibold text-lg">
                {Math.floor(producto.saldo / producto.cantcaja)} cj{producto.saldo % producto.cantcaja > 0 ? ` + ${producto.saldo % producto.cantcaja} ${producto.umed}` : ''}
              </p>
              <p className="text-xs text-[var(--body-subtle)]">{producto.saldo} {producto.umed}</p>
              {isEditing && (
                <div className="mt-2 space-y-1">
                  <Label className="text-xs text-[var(--body)] uppercase tracking-wider">Unidad de medida</Label>
                  <select
                    value={editUmed}
                    onChange={e => setEditUmed(e.target.value)}
                    className="w-full h-8 rounded-md border border-[var(--border)] dark:border-[var(--border)] bg-transparent px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:bg-[var(--muted)]"
                  >
                    <option value="U">Unid</option>
                    <option value="SET">Set</option>
                  </select>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-[var(--body)] mb-1">Packing</p>
              {isEditing ? (
                <div className="space-y-2 mt-1">
                  <div className="space-y-1">
                    <Label className="text-xs text-[var(--body)] uppercase tracking-wider">Cantidad por caja</Label>
                    <Input value={editCantCaja} onChange={e => setEditCantCaja(e.target.value)} type="number" min="1" step="1" className="h-8 text-sm" placeholder="Cant/caja" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-[var(--body)] uppercase tracking-wider">Peso por caja (kg)</Label>
                    <Input value={editPesoCaja} onChange={e => setEditPesoCaja(e.target.value)} type="number" min="0" step="0.01" className="h-8 text-sm" placeholder="kg" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-[var(--body)] uppercase tracking-wider">Cubicaje por caja (m³)</Label>
                    <Input value={editCubiCaja} onChange={e => setEditCubiCaja(e.target.value)} type="number" min="0" step="0.01" className="h-8 text-sm" placeholder="m³" />
                  </div>
                </div>
              ) : (
                <>
                  {producto.cantcaja > 1 ? (
                    <>
                      <p className="font-medium text-sm">{producto.cantcaja} {producto.umed}/Caja</p>
                      <p className="text-xs text-[var(--body)]">{producto.pesocaja} kg · {producto.cubicaja} m³</p>
                    </>
                  ) : (
                    <p className="text-sm text-[var(--body)]">—</p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Pricing Section */}
          {!ocultarPrecios && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold uppercase tracking-wider text-xs text-[var(--body)]">Precios (CLP)</h3>
              {canEditPrices && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1.5 rounded-pill text-[var(--body-subtle)] hover:text-[var(--heading)] hover:bg-[var(--muted)] transition-colors"
                  title="Editar producto"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-3 bg-[var(--muted)] p-4 rounded-card">
                {producto.costo ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Costo *</Label>
                        <Input type="number" step="0.01" min="0.01" value={editCosto} onChange={e => setEditCosto(e.target.value)} placeholder="0.00" />
                      </div>
                      <div>
                        <Label className="text-xs">% Ganancia *</Label>
                        <Input type="number" step="0.01" min="0" value={editMargenPct} onChange={e => setEditMargenPct(e.target.value)} placeholder="30" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Precio de venta</Label>
                      <div className="h-9 px-3 rounded-md border border-[var(--border)] bg-background flex items-center text-sm">
                        {precioCalculado !== null ? formatCLP(precioCalculado) : 'Ingresa costo y % de ganancia'}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-[var(--body)] italic">Producto legacy — ingresa precio manual</p>
                    <div>
                      <Label className="text-xs">Precio de venta *</Label>
                      <Input data-testid="legacy-price-input" type="number" step="0.01" min="0.01" value={prcVenta} onChange={e => setPrcVenta(e.target.value)} placeholder="0.00" />
                    </div>
                  </>
                )}
                <div>
                  <Label className="text-xs">Stock minimo</Label>
                  <Input type="number" step="1" min="0" value={editStockMinimo} onChange={e => setEditStockMinimo(e.target.value)} placeholder="0" />
                </div>
              </div>
            ) : (
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Costo</TableCell>
                    <TableCell className="text-right">{producto.costo ? formatCLP(producto.costo) : '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Margen</TableCell>
                    <TableCell className="text-right">{producto.margen_pct !== null ? `${Number(producto.margen_pct)}%` : '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Precio venta</TableCell>
                    <TableCell className="text-right font-bold">{formatCLP(producto.prcventa)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}

            {isEditing && (
              <div className="flex gap-2 mt-4">
                {/* ponytail: handleOpenStatus(true) resetea campos del form, no solo cambia el estado del Sheet. Ver nota S3: no confundir con callback de apertura/cierre. */}
                <Button variant="outline" className="flex-1" onClick={() => { setIsEditing(false); handleOpenStatus(true); }}>
                  <X className="w-4 h-4 mr-1" /> Cancelar
                </Button>
                <Button className="flex-1" onClick={handleSaveProduct} disabled={isSaving}>
                  {isSaving ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            )}
          </div>
          )}

          {/* Admin Tools */}
          {canEditPrices && (
             <div className="border-t pt-6 space-y-4">
                <h3 className="font-semibold uppercase tracking-wider text-xs text-[var(--body)]">Herramientas de Gestion</h3>

                <div className="space-y-4">
                   <div
                     className="p-6 border-2 border-dashed rounded-xl text-center cursor-pointer hover:bg-[var(--muted)] dark:hover:bg-[var(--muted)] transition-colors border-[var(--border)] dark:border-[var(--border)]"
                     onClick={() => fileInputRef.current?.click()}
                   >
                     {previewUrl ? (
                         <div className="relative w-full aspect-square max-w-[120px] mx-auto overflow-hidden rounded-md border shadow-sm">
                            <img src={previewUrl} alt="Preview" className="object-cover w-full h-full" />
                         </div>
                     ) : (
                         <div className="text-[var(--body)]">
                           <p className="font-semibold text-sm">Click para subir imagen</p>
                           <p className="text-xs text-[var(--body)] mt-1">NUEVA IMAGEN INDIVIDUAL</p>
                         </div>
                     )}
                     <input
                       type="file"
                       ref={fileInputRef}
                       className="hidden"
                       accept="image/jpeg,image/png,image/webp"
                       onChange={handleFileChange}
                       data-testid="upload-input"
                     />
                   </div>

                   {selectedFile && (
                     <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-[var(--destructive)] hover:text-[var(--destructive)]"
                          onClick={() => { setSelectedFile(null); setPreviewUrl(null); }}
                        >
                          Limpiar
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 font-bold bg-[var(--primary)] hover:bg-[var(--primary)] h-9"
                          onClick={handleUpload}
                          disabled={isUploading}
                        >
                          {isUploading ? 'Subiendo...' : 'SUBIR IMAGEN'}
                        </Button>
                     </div>
                   )}
                </div>

                {!isEditing && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--body)] uppercase tracking-wider">Categoria</Label>
                  <select
                    value={categoria}
                    onChange={e => handleCategoriaChange(e.target.value)}
                    className="w-full h-9 rounded-md border border-[var(--border)] dark:border-[var(--border)] bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:bg-[var(--muted)]"
                  >
                    <option value="">Sin categoria</option>
                    {categoriasDisponibles.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                )}

                {isAdmin && !isEditing && (
                  <Button
                    data-testid="eliminar-producto-btn"
                    variant="outline"
                    className="w-full text-[var(--destructive)] border-[var(--destructive)]/40 hover:bg-[var(--destructive)]/10"
                    onClick={() => { setCodigoConfirmacion(''); setShowEliminar(true); }}
                  >
                    <Trash2 className="w-4 h-4 mr-1" /> Eliminar producto
                  </Button>
                )}
             </div>
          )}

          </div>
        </div>
      </SheetContent>
      {producto && (
        <AgregarANotaVentaModal
          open={showPrenota}
          onClose={() => setShowPrenota(false)}
          producto={producto}
        />
      )}

      {/* Confirmacion de soft-delete: exige el codigo exacto (case-sensitive). */}
      <Dialog open={showEliminar} onOpenChange={setShowEliminar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar producto</DialogTitle>
            <DialogDescription>
              El producto dejará de aparecer en listados y búsquedas. No se borra
              el historial. Para confirmar, escribí el código exacto{' '}
              <span className="font-mono font-semibold">{producto?.codigo}</span>.
            </DialogDescription>
          </DialogHeader>

          <Input
            data-testid="confirmar-eliminar-input"
            value={codigoConfirmacion}
            onChange={e => setCodigoConfirmacion(e.target.value)}
            placeholder={producto?.codigo ?? ''}
            aria-label="Codigo de confirmacion"
          />

          <DialogFooter>
            <Button data-testid="cancelar-eliminar-btn" variant="outline" onClick={() => setShowEliminar(false)}>
              Cancelar
            </Button>
            <Button
              data-testid="confirmar-eliminar-btn"
              variant="destructive"
              disabled={codigoConfirmacion.trim() !== producto?.codigo || isDeleting}
              onClick={handleEliminar}
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
