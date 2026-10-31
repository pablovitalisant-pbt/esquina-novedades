'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import flags from '@/config/feature-flags.json';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import type { SessionProp } from '@/types';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Trash2, Pencil, FileDown, MessageCircle, Plus, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { PagarNotaDialog } from '@/components/PagarNotaDialog';
import { AplicarSaldoFavorDialog } from '@/components/AplicarSaldoFavorDialog';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import { formatCLP } from '@/lib/utils';
import { EMPRESA, hexToRgb, hexToArgb } from '@/lib/empresa';
import { useBusquedaClientes } from '@/hooks/useBusquedaClientes';

// Convierte un Blob (de /api/share-image) a data URL base64 para doc.addImage.
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Colores de marca para jsPDF (no lee CSS vars): hex de EMPRESA → [r, g, b].
const PRIMARIO = hexToRgb(EMPRESA.colores.primario);
const ACENTO = hexToRgb(EMPRESA.colores.acento);
const TINTA = hexToRgb(EMPRESA.colores.tinta);
const FONDO_SUAVE = hexToRgb(EMPRESA.colores.fondoSuave);
const TEXTO_CLARO = hexToRgb(EMPRESA.colores.textoClaro);
const BORDE = hexToRgb(EMPRESA.colores.borde);

type PrenotaItem = {
  id: string;
  codigo: string;
  descripcion: string | null;
  imagen_url: string | null;
  modalidad: string | null;
  unidades: number;
  precio: number;
  subtotal: number;
};

type PrenotaDetalle = {
  titulo: string;
  tipo?: string | null;
  nombre_cliente: string | null;
  cliente_nombre: string | null;
  cliente_saldo_favor?: number | null;
  cliente_id?: number | null;
  estado?: string | null;
  total_pagado: number;
  saldo_pendiente: number;
  items: PrenotaItem[];
};

type ClienteResult = { id: number; nombre: string; telefono: string | null };

type ProductoResult = {
  codigo: string;
  detalle: string | null;
  imagen_url: string | null;
  empresa_id: number;
  prcventa: number;
  precio_mayor: number | null;
  saldo: number;
};

type CellHookData = {
  column: { index: number };
  row?: { index: number };
  section: string;
  cell: { x: number; y: number };
};

// Modalidad/tipo: 'mayor' o 'detalle' (default). Filas legacy ya migradas (046).
const esMayor = (item: Pick<PrenotaItem, 'modalidad'>) => item.modalidad === 'mayor';
const etiquetaModalidad = (item: Pick<PrenotaItem, 'modalidad'>) =>
  esMayor(item) ? 'Por mayor' : 'Por menor';

const etiquetaTipo = (tipo: string) =>
  ({ mayor: 'POR MAYOR', menor: 'POR MENOR', mixta: 'MIXTA' } as Record<string, string>)[tipo] ?? tipo.toUpperCase();

function derivarTipo(items: PrenotaItem[]): string | null {
  if (items.length === 0) return null;
  if (items.every(esMayor)) return 'mayor';
  if (items.every(i => !esMayor(i))) return 'menor';
  return 'mixta';
}

function PrenotaItemsTable({
  items,
  onEliminar,
  prenotaId,
  onActualizar,
  autoFocusItemId,
  onAutoFocusConsumed,
}: {
  items: PrenotaItem[];
  onEliminar: (itemId: string) => void;
  prenotaId: string;
  onActualizar: () => void;
  autoFocusItemId?: string | null;
  onAutoFocusConsumed?: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUnidades, setEditUnidades] = useState<number>(0);
  const [editPrecio, setEditPrecio] = useState<number>(0);
  const [editModalidad, setEditModalidad] = useState<'detalle' | 'mayor'>('detalle');
  // Precio editado a mano: el cambio de modalidad ya no debe pisarlo.
  const [precioEditado, setPrecioEditado] = useState(false);
  const [saving, setSaving] = useState(false);
  const consumedAutoFocusRef = useRef<string | null>(null);
  const unidadesInputRef = useRef<HTMLInputElement>(null);

  const abrirEdicion = (item: PrenotaItem) => {
    setEditingId(item.id);
    setEditUnidades(Number(item.unidades));
    setEditPrecio(Number(item.precio));
    setEditModalidad(esMayor(item) ? 'mayor' : 'detalle');
    setPrecioEditado(false);
  };

  // Auto-open editing when autoFocusItemId matches a loaded item
  useEffect(() => {
    if (autoFocusItemId != null && consumedAutoFocusRef.current !== autoFocusItemId) {
      const target = items.find(item => item.id === autoFocusItemId);
      if (target) {
        consumedAutoFocusRef.current = autoFocusItemId;
        abrirEdicion(target);
        onAutoFocusConsumed?.();
      }
    }
  }, [items, autoFocusItemId, onAutoFocusConsumed]);

  // Focus and select the Unidades input when editing opens via auto-focus
  useEffect(() => {
    if (editingId != null && unidadesInputRef.current) {
      unidadesInputRef.current.focus();
      unidadesInputRef.current.select();
    }
  }, [editingId]);

  const handleGuardar = async (item: PrenotaItem) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/notas-venta/${prenotaId}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unidades: editUnidades, precio: editPrecio }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Error al guardar');
        return;
      }
      setEditingId(null);
      consumedAutoFocusRef.current = null;
      onActualizar();
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // La modalidad es mutable por línea. Se aplica al instante: sin precio
  // explícito el servidor usa el de la nueva modalidad (y valida precio mayor).
  const handleModalidad = async (item: PrenotaItem, nueva: 'detalle' | 'mayor') => {
    if (nueva === editModalidad) return;
    setSaving(true);
    try {
      const body = precioEditado ? { modalidad: nueva, precio: editPrecio } : { modalidad: nueva };
      const res = await fetch(`/api/notas-venta/${prenotaId}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Error al cambiar modalidad');
        return;
      }
      const actualizado = await res.json();
      setEditModalidad(nueva);
      setEditPrecio(Number(actualizado?.precio ?? editPrecio));
      setPrecioEditado(false);
      onActualizar();
    } catch {
      toast.error('Error al cambiar modalidad');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-card overflow-hidden bg-[var(--card)] shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)] text-[var(--body)]">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Código</th>
              <th className="text-left px-4 py-3 font-medium">Imagen</th>
              <th className="text-left px-4 py-3 font-medium">Descripción</th>
              <th className="text-left px-4 py-3 font-medium">Modalidad</th>
              <th className="text-right px-4 py-3 font-medium">Unidades</th>
              <th className="text-right px-4 py-3 font-medium">Precio</th>
              <th className="text-right px-4 py-3 font-medium">Total</th>
              <th className="text-right px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="border-t border-border align-top">
                <td className="px-4 py-3 font-mono text-xs text-[var(--body)] text-[var(--body-subtle)]">{item.codigo}</td>
                <td className="px-4 py-3">
                  <div className="w-20 h-20 rounded-md overflow-hidden bg-[var(--muted)] border border-[var(--border)]">
                    <ImageWithFallback
                      src={item.imagen_url}
                      codigo={item.codigo}
                      fill
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{item.descripcion}</div>
                </td>
                <td className="px-4 py-3">{etiquetaModalidad(item)}</td>
                <td className="px-4 py-3 text-right">{item.unidades}</td>
                <td className="px-4 py-3 text-right">
                  {formatCLP(Number(item.precio))} /u
                </td>
                <td className="px-4 py-3 text-right font-medium text-[var(--heading)]">
                  {formatCLP(Number(item.subtotal))}
                </td>
                <td className="px-4 py-3 text-right">
                  {editingId === item.id ? (
                    <div className="flex flex-col gap-2 items-end min-w-[140px]">
                      <div className="flex flex-col gap-1 w-full">
                        <label className="text-xs text-[var(--body-subtle)]">Unidades</label>
                        <input
                          ref={unidadesInputRef}
                          type="number"
                          min={1}
                          value={editUnidades}
                          onFocus={e => e.target.select()}
                          onChange={e => setEditUnidades(Number(e.target.value))}
                          className="border rounded px-2 py-1 text-sm w-full"
                        />
                      </div>
                      <div className="flex flex-col gap-1 w-full">
                        <label className="text-xs text-[var(--body-subtle)]">Modalidad</label>
                        <select
                          value={editModalidad}
                          onChange={e => handleModalidad(item, e.target.value as 'detalle' | 'mayor')}
                          className="border rounded px-2 py-1 text-sm w-full"
                        >
                          <option value="detalle">Por menor</option>
                          <option value="mayor">Por mayor</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1 w-full">
                        <label className="text-xs text-[var(--body-subtle)]">Precio</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={editPrecio}
                          onFocus={e => e.target.select()}
                          onChange={e => { setEditPrecio(Number(e.target.value)); setPrecioEditado(true); }}
                          className="border rounded px-2 py-1 text-sm w-full"
                        />
                      </div>
                      <Button
                        size="sm"
                        className="text-xs w-full" variant="brand"
                        onClick={() => handleGuardar(item)}
                        disabled={saving || editUnidades < 1}
                      >
                        {saving ? 'Guardando...' : 'Guardar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive" className="w-full"
                        onClick={() => { onEliminar(item.id); setEditingId(null); }}
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> Eliminar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs w-full"
                        onClick={() => {
                          setEditingId(null);
                          consumedAutoFocusRef.current = null;
                        }}
                      >
                        Cerrar
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => {
                        consumedAutoFocusRef.current = null;
                        abrirEdicion(item);
                      }}
                    >
                      <Pencil className="w-3 h-3 mr-1" /> Editar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PrenotaDetallePage({}: { session: SessionProp; params?: { id: string } }) {
  const router = useRouter();
  // El id se lee de la URL real (useParams), no del prop `params` horneado en el
  // HTML: el service worker puede servir el shell cacheado de OTRA nota para esta
  // URL, y el contenido debe corresponder a la URL que el usuario ve (slice
  // notas-venta-shell-offline-nunca-visitada). Sin esto, offline se mostraría la
  // nota cacheada en vez de la solicitada.
  const id = useParams().id as string;


  const [prenota, setPrenota] = useState<PrenotaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [enviandoWhatsapp, setEnviandoWhatsapp] = useState(false);
  // pos3 — la pantalla de éxito del POS pide PDF/WhatsApp al abrir esta nota.
  const [accionAuto, setAccionAuto] = useState<'pdf' | 'whatsapp' | null>(null);
  const [clienteQuery, setClienteQuery] = useState('');
  const { resultados: clienteResults, cargando: clientesLoading } = useBusquedaClientes<ClienteResult>(clienteQuery);
  const prodAbortRef = useRef<AbortController | null>(null);

  // Auto-focus on newly added item
  const [autoFocusItemId, setAutoFocusItemId] = useState<string | null>(null);
  const limpiarAutoFocus = useCallback(() => setAutoFocusItemId(null), []);
  const agregarCallCounterRef = useRef(0);

  // Búsqueda de productos (buscador directo, sin Kardex)
  const [productoQuery, setProductoQuery] = useState('');
  const [productoResults, setProductoResults] = useState<ProductoResult[]>([]);
  const [productoLoading, setProductoLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const agregandoRef = useRef<string | null>(null);

  // ─── Pago ("Marcar como pagada") ────────────────────────────────
  const [pagarOpen, setPagarOpen] = useState(false);
  const [aplicarSaldoOpen, setAplicarSaldoOpen] = useState(false);

  const fetchPrenota = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notas-venta/${id}`);
      if (res.ok) {
        const data = await res.json();
        setPrenota(data);
      } else {
        toast.error('No se pudo cargar la nota de venta');
      }
    } catch {
      toast.error('No se pudo cargar la nota de venta');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrenota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Búsqueda de clientes (hook compartido; ver PRD §"Refactors A16-A18")

  const asignarCliente = async (c: ClienteResult) => {
    try {
      await fetch(`/api/notas-venta/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: c.id }),
      });
      setClienteQuery('');
      await fetchPrenota();
    } catch {
      toast.error('No se pudo asignar cliente');
    }
  };

  const quitarCliente = async () => {
    try {
      await fetch(`/api/notas-venta/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: null }),
      });
      await fetchPrenota();
    } catch {
      toast.error('No se pudo quitar cliente');
    }
  };

  // Búsqueda de productos con debounce + AbortController
  useEffect(() => {
    if (productoQuery.trim().length < 2) {
      setProductoResults([]);
      return;
    }
    if (prodAbortRef.current) prodAbortRef.current.abort();
    const controller = new AbortController();
    prodAbortRef.current = controller;
    setProductoLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/productos?search=${encodeURIComponent(productoQuery)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const { data } = await res.json();
          setProductoResults(data || []);
          setHighlightedIndex(0);
          setShowResults(true);
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === 'AbortError')) setProductoResults([]);
      } finally {
        setProductoLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoQuery]);

  const agregarProducto = async (prod: ProductoResult) => {
    // Bloquea solo re-agregar el MISMO producto en vuelo (anti doble-click);
    // deja pasar adds concurrentes de productos distintos (el contador
    // agregarCallCounterRef resuelve el auto-focus del último).
    if (agregandoRef.current === prod.codigo) return;
    agregandoRef.current = prod.codigo;
    agregarCallCounterRef.current += 1;
    const currentCall = agregarCallCounterRef.current;
    try {
      const res = await fetch(`/api/notas-venta/${id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: prod.codigo,
          descripcion: prod.detalle,
          imagen_url: prod.imagen_url,
          empresa_id: prod.empresa_id,
          unidades: 1,
          modalidad: 'detalle',
          stock_referencia: prod.saldo,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Error al agregar producto');
        return;
      }
      const item = await res.json();
      // Only auto-focus if this is still the latest agregarProducto call
      if (currentCall === agregarCallCounterRef.current) {
        setAutoFocusItemId(item.id);
      }
      setProductoQuery('');
      setProductoResults([]);
      setShowResults(false);
      await fetchPrenota();
      toast.success('Producto agregado');
    } catch {
      toast.error('No se pudo agregar el producto');
    } finally {
      agregandoRef.current = null;
    }
  };

  const eliminarItem = async (itemId: string) => {
    if (!confirm('¿Eliminar este ítem de la nota de venta?')) return;
    try {
      const res = await fetch(`/api/notas-venta/${id}/items/${itemId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Error al eliminar item');
        return;
      }
      await fetchPrenota();
    } catch {
      toast.error('No se pudo eliminar item');
    }
  };

  const exportarExcel = async () => {
    if (!prenota?.items?.length) return;
    const infoRows = [
      { Campo: 'Título', Valor: prenota.titulo },
      { Campo: 'Cliente comprador', Valor: prenota.nombre_cliente || prenota.cliente_nombre || '-' },
    ];

    const toRows = (items: PrenotaItem[]) => items.map(i => ({
      'Código': i.codigo,
      'Descripción': i.descripcion,
      'Modalidad': etiquetaModalidad(i),
      'Unidades': Number(i.unidades),
      'Precio': Number(i.precio),
      'Total': Number(i.subtotal),
    }));

    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const borde = { style: 'thin' as const, color: { argb: hexToArgb(EMPRESA.colores.borde) } };
    const addSheet = (name: string, rows: Record<string, unknown>[]) => {
      const ws = wb.addWorksheet(name);
      ws.columns = Object.keys(rows[0]).map(k => ({ header: k, key: k }));
      ws.addRows(rows);
      // Encabezado de tabla: violeta de marca + texto claro, legible al imprimir.
      ws.getRow(1).eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(EMPRESA.colores.primario) } };
        cell.font = { color: { argb: hexToArgb(EMPRESA.colores.textoClaro) }, bold: true };
        cell.border = { top: borde, left: borde, bottom: borde, right: borde };
      });
    };
    addSheet('Info', infoRows);
    addSheet('Items', toRows(prenota.items));

    const filename = `${prenota.titulo}${prenota.nombre_cliente ? ' — ' + prenota.nombre_cliente : ''}.xlsx`;
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Construye el PDF en memoria (doc jsPDF) sin llamar a .save() — compartido
  // por exportarPDF (descarga) y compartirWhatsApp (Web Share API).
  const construirDocPDF = async (): Promise<jsPDF | null> => {
    if (!prenota?.items?.length) return null;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const fecha = new Date().toLocaleDateString('es-CL', {
      day: '2-digit', month: 'long', year: 'numeric'
    });

    // ─── Header: banda --accent (#F2B936) + logo/marca a la izquierda y
    //     título "NOTA DE VENTA" a la derecha (mockup minimal-yellow).
    // Sin logo: wordmark de texto hasta recibir el logo de la clienta (PRD 10.4).
    doc.setFillColor(...ACENTO);
    doc.rect(0, 0, pageWidth, 4, 'F');

    // Logo oficial (PNG 400x186 → 30x14 mm, misma proporción). Si falla el
    // fetch o no hay logo, cae al wordmark de texto.
    let logoDibujado = false;
    if (EMPRESA.logoNota) {
      try {
        const res = await fetch(EMPRESA.logoNota);
        if (res.ok) {
          doc.addImage(await blobToDataURL(await res.blob()), 'PNG', 14, 12, 30, 14);
          logoDibujado = true;
        }
      } catch {
        // Fallback silencioso al wordmark de abajo.
      }
    }
    if (!logoDibujado) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...TINTA);
      doc.text(EMPRESA.nombre, 14, 20);
    }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TINTA);
    doc.text(EMPRESA.razonSocial, 14, 31);
    doc.text(EMPRESA.direccion, 14, 36);
    doc.text(EMPRESA.ciudad, 14, 41);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(...TINTA);
    doc.text('NOTA DE VENTA', pageWidth - 14, 20, { align: 'right' });

    // ─── Bloque de info: caja "Nota de venta para:" + caja N°/Fecha ───
    const clienteNombre = prenota.nombre_cliente || prenota.cliente_nombre || '-';
    const infoY = 46;
    const boxH = 22;
    const leftBoxW = 96;
    const rightBoxW = 62;
    const rightBoxX = pageWidth - 14 - rightBoxW;
    doc.setFillColor(...FONDO_SUAVE); // fondo suave de marca
    doc.roundedRect(14, infoY, leftBoxW, boxH, 2, 2, 'F');
    doc.roundedRect(rightBoxX, infoY, rightBoxW, boxH, 2, 2, 'F');
    doc.setTextColor(...TINTA);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Nota de venta para:', 20, infoY + 8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...TINTA);
    doc.text(clienteNombre, 20, infoY + 17);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`N°: ${id}`, rightBoxX + 5, infoY + 10);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${fecha}`, rightBoxX + 5, infoY + 18);

    // Descargar imágenes vía proxy /api/share-image (mismo que WhatsApp).
    // Ponytail: base64DataURL para que doc.addImage no dependa de CORS/red al dibujar.
    const imageCache = new Map<string, string | null>();
    await Promise.all(
      prenota.items.map(async (item) => {
        if (!item.imagen_url) { imageCache.set(item.id, null); return; }
        try {
          const res = await fetch(`/api/share-image?url=${encodeURIComponent(item.imagen_url)}`);
          if (!res.ok) { imageCache.set(item.id, null); return; }
          const blob = await res.blob();
          imageCache.set(item.id, await blobToDataURL(blob));
        } catch {
          imageCache.set(item.id, null);
        }
      })
    );

    // Tabla con columna Imagen (primera) — sin columna Empresa (deuda PRD §9.3.1).
    // Header dark, texto blanco, zebra striping. Cantidades en unidades.
    const startY = infoY + boxH + 10;
    const rows = prenota.items.map((i) => {
      return [
        '', // columna Imagen — se dibuja aparte vía didDrawCell (index 0)
        i.codigo,
        i.descripcion || '',
        Number(i.unidades),
        formatCLP(Number(i.precio)),
        formatCLP(Number(i.subtotal)),
        etiquetaModalidad(i),
      ];
    });

    const totalUnidadesSum = prenota.items.reduce((sum: number, i) => sum + Number(i.unidades), 0);

    autoTable(doc, {
      startY,
      head: [['Imagen', 'Código', 'Descripción', 'Unidades', 'Precio', 'Total', 'Modalidad']],
      body: rows,
      foot: [[
        { content: 'TOTALES NETOS', colSpan: 3, styles: { halign: 'right' } },
        { content: `${totalUnidadesSum} unidades`, colSpan: 2, styles: { halign: 'right' } },
        { content: '', colSpan: 1 },
        { content: '', colSpan: 1 },
      ]],
      showFoot: 'lastPage', // fix duplicación: el foot solo se pinta en la última página
      footStyles: {
        fillColor: ACENTO, // oro de marca, mismo color que la caja de Total
        textColor: TINTA,
        fontStyle: 'bold',
        fontSize: 10,
      },
      styles: { fontSize: 9, cellPadding: 3, fontStyle: 'bold', textColor: TINTA, lineColor: BORDE, lineWidth: 0.1 },
      headStyles: { fillColor: PRIMARIO, textColor: TEXTO_CLARO, fontSize: 9, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: FONDO_SUAVE },
      columnStyles: {
        0: { cellWidth: 18 },            // Imagen — ancho fijo (BUG-039)
        1: { cellWidth: 24, halign: 'left' },
        2: { cellWidth: 40, halign: 'left' },
        3: { cellWidth: 20, halign: 'right' }, // Unidades
        4: { cellWidth: 26, halign: 'right' }, // Precio
        5: { cellWidth: 28, halign: 'right' }, // Total
        6: { cellWidth: 20, halign: 'right' }, // Modalidad
      },
      didDrawCell: (data: CellHookData) => {
        // Columna 0 = Imagen: dibujar si hay base64 cacheado
        if (data.column.index === 0 && data.row?.index !== undefined && data.section === 'body') {
          const item = prenota.items[data.row.index];
          const b64 = item && imageCache.get(item.id);
          if (b64) {
            const img = data.cell;
            try {
              doc.addImage(b64, 'PNG', img.x + 1, img.y + 1, 14, 14);
            } catch {
              // imagen inválida → celda en blanco
            }
          }
        }
      },
    });

    // ─── Totales: caja "Total" resaltada --accent + Pagado/Pendiente ───
    const total = prenota.items.reduce(
      (sum: number, i) => sum + Number(i.subtotal), 0
    );
    const totalStr = `Total: ${formatCLP(total)}`;
    const pagado = Number(prenota.total_pagado);
    const pendiente = Number(prenota.saldo_pendiente);
    const totalBoxW = 60;
    const totalBoxX = pageWidth - 14 - totalBoxW;
    const footerBandH = 16;
    const footerBandY = pageHeight - footerBandH;

    let finalY = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    // BUG-062: medir el alto real del bloque de totales (desde finalY hasta el
    // baseline de "Gracias por su compra"). Si cae en la banda del footer (que se
    // pinta después y es opaca) o se pasa del borde de página, mover todo el
    // bloque a una hoja nueva con un Y alto. Con tablas largas finalY queda muy
    // abajo y Pagado/Pendiente llegaban a superar pageHeight (jsPDF no los dibuja).
    const yResumen0 = finalY + 20;
    const blockBottom = yResumen0 + 6 + 10; // baseline "Gracias"
    if (blockBottom + 4 > footerBandY) {
      doc.addPage();
      finalY = 20;
    }

    doc.setFillColor(...ACENTO); // oro de marca
    doc.rect(totalBoxX, finalY, totalBoxW, 14, 'F');
    doc.setTextColor(...TINTA); // --heading
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(totalStr, totalBoxX + 4, finalY + 8);

    // Pagado / Pendiente reestilizados como filas etiqueta/valor, alineadas a la derecha.
    let yResumen = finalY + 20;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...TINTA); // --heading
    doc.text(`Pagado: ${formatCLP(pagado)}`, pageWidth - 14, yResumen, { align: 'right' });
    yResumen += 6;
    doc.text(`Pendiente: ${formatCLP(pendiente)}`, pageWidth - 14, yResumen, { align: 'right' });

    // ─── Footer: agradecimiento + banda de contacto ───
    const fy = yResumen + 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...TINTA);
    doc.text('Gracias por su compra', 14, fy);

    // Banda de contacto anclada al borde inferior real de la página (no al fy
    // acumulado — con pocos ítems quedaba "flotando" en el medio de la hoja).
    // footerBandH/footerBandY ya se declararon arriba (BUG-062) para medir el
    // espacio del bloque de totales.
    doc.setFillColor(...ACENTO); // oro de marca
    doc.rect(0, footerBandY, pageWidth, footerBandH, 'F');
    doc.setTextColor(...TINTA); // --heading
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`WhatsApp ${EMPRESA.whatsapp}`, 14, footerBandY + 6);
    doc.text(`${EMPRESA.direccion} | ${EMPRESA.ciudad}`, 14, footerBandY + 10);
    doc.text(`Horario: ${EMPRESA.horario}`, 14, footerBandY + 14);

    return doc;
  };

  const exportarPDF = async () => {
    if (!prenota?.items?.length) return;
    setExportandoPdf(true);
    try {
      const doc = await construirDocPDF();
      if (!doc) return;
      const filename = `${prenota.titulo}${prenota.nombre_cliente ? ' — ' + prenota.nombre_cliente : ''}.pdf`;
      doc.save(filename);
    } finally {
      setExportandoPdf(false);
    }
  };

  const nombreArchivoPDF = () =>
    `${prenota!.titulo}${prenota!.nombre_cliente ? ' — ' + prenota!.nombre_cliente : ''}.pdf`;

  // Slice: enviar PDF por WhatsApp en un click. Si el navegador soporta Web
  // Share con archivos (canShare), se arma un File PDF y se abre el selector
  // nativo del SO; el usuario elige WhatsApp y el PDF va adjunto. Sin soporte
  // (p.ej. Firefox) → fallback: descarga + aviso.
  const compartirWhatsApp = async () => {
    if (!prenota?.items?.length) return;
    setEnviandoWhatsapp(true);
    try {
      const doc = await construirDocPDF();
      if (!doc) return;
      const filename = nombreArchivoPDF();

      // Web Share API con archivos soportada?
      if (navigator.canShare && navigator.share) {
        const blob = doc.output('blob');
        const pdfFile = new File([blob], filename, { type: 'application/pdf' });
        if (navigator.canShare({ files: [pdfFile] })) {
          try {
            await navigator.share({ files: [pdfFile], title: prenota.titulo });
            return; // éxito — no cae al fallback
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return; // usuario cerró el selector — no es error
            toast.error('No se pudo compartir el PDF por WhatsApp');
            return;
          }
        }
      }

      // Fallback obligatorio (sin soporte de canShare con archivos, p.ej. Firefox).
      doc.save(filename);
      toast.warning('Tu navegador no soporta compartir el PDF directo. Adjúntalo manualmente en WhatsApp.');
    } finally {
      setEnviandoWhatsapp(false);
    }
  };

  // pos3 — disparo por query param (?accion=pdf|whatsapp) desde el POS.
  // Se lee window.location en un efecto para no forzar Suspense/useSearchParams.
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get('accion');
    if (a === 'pdf' || a === 'whatsapp') setAccionAuto(a);
  }, []);

  useEffect(() => {
    if (!accionAuto || !prenota?.items?.length) return;
    const accion = accionAuto;
    setAccionAuto(null);
    if (accion === 'pdf') void exportarPDF();
    else void compartirWhatsApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accionAuto, prenota]);

  return (
    <>
    <div className="flex flex-col gap-6 fade-in zoom-in-95 duration-200">
      <div className="flex flex-col gap-3">
        <button
          onClick={async () => {
            if (prenota?.items?.length === 0) {
              if (confirm('Esta nota de venta no tiene productos. ¿Deseas eliminarla?')) {
                const res = await fetch(`/api/notas-venta/${id}`, { method: 'DELETE' });
                if (!res.ok) {
                  toast.error('No se pudo eliminar la nota de venta');
                  return;
                }
              }
            }
            router.push('/notas-venta');
          }}
          className="text-sm text-[var(--body)] hover:text-[var(--heading)] w-fit"
        >
          ← Volver
        </button>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{prenota?.titulo || 'Nota de Venta'}</h1>
            {(() => {
              // 5f aún no expone `tipo` en todas las respuestas: se deriva localmente.
              const tipo = prenota?.tipo ?? derivarTipo(prenota?.items ?? []);
              if (!tipo) return null;
              return (flags as Record<string, boolean>)['notas-venta-modalidad'] === true
                ? <Badge variant="secondary">{etiquetaTipo(tipo)}</Badge>
                : <p className="text-sm text-[var(--body-subtle)]">Tipo: {etiquetaTipo(tipo)}</p>;
            })()}
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <Button
              variant="outline"
              onClick={exportarExcel}
              disabled={!prenota?.items?.length}
            >
              Exportar Excel
            </Button>
            <Button
              variant="outline"
              onClick={exportarPDF}
              disabled={!prenota?.items?.length || exportandoPdf}
            >
              <FileDown className="w-4 h-4 mr-2" />
              {exportandoPdf ? 'Generando PDF...' : 'Exportar PDF'}
            </Button>
            <Button
              variant="success"
              onClick={compartirWhatsApp}
              disabled={!prenota?.items?.length || enviandoWhatsapp}
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              {enviandoWhatsapp ? 'Enviando...' : 'Enviar por WhatsApp'}
            </Button>
          </div>
        </div>
      </div>

      <div className="border rounded-card p-5 bg-[var(--card)] shadow-sm flex flex-col gap-4">
        <h2 className="font-semibold text-base">Cliente</h2>
        {(prenota?.nombre_cliente || prenota?.cliente_nombre) ? (
          <div className="flex items-center gap-3">
            <div className="font-medium">Cliente: {prenota.nombre_cliente || prenota.cliente_nombre}</div>
            <button onClick={quitarCliente} className="text-sm text-[var(--destructive)] hover:brightness-110">✕</button>
          </div>
        ) : (
          <>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--body-subtle)]" />
              <Input
                placeholder="Buscar cliente..."
                value={clienteQuery}
                onChange={e => setClienteQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            {clientesLoading && <p className="text-xs text-[var(--body-subtle)]">Buscando...</p>}
            {clienteResults.length > 0 && (
              <div className="flex flex-col gap-2">
                {clienteResults.map(c => (
                  <button
                    key={c.id}
                    onClick={() => asignarCliente(c)}
                    className="text-left p-3 rounded-card border border-border hover:bg-[var(--accent)]"
                  >
                    <span className="font-medium">{c.nombre}</span>
                    {c.telefono && <span className="text-[var(--body-subtle)] ml-2">{c.telefono}</span>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Buscador de productos (sin Kardex) ─── */}
      <div className="border rounded-card p-5 bg-[var(--card)] shadow-sm flex flex-col gap-3">
        <h2 className="font-semibold text-base">Agregar producto</h2>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--body-subtle)]" />
          <Input
            placeholder="Buscar por código o descripción..."
            value={productoQuery}
            onChange={e => { setProductoQuery(e.target.value); setShowResults(true); }}
            onFocus={() => { if (productoResults.length > 0) setShowResults(true); }}
            onBlur={() => setTimeout(() => setShowResults(false), 200)}
            onKeyDown={e => {
              if (!showResults || productoResults.length === 0) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightedIndex(i => Math.min(i + 1, productoResults.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightedIndex(i => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const prod = productoResults[highlightedIndex];
                if (prod) agregarProducto(prod);
              } else if (e.key === 'Escape') {
                setShowResults(false);
              }
            }}
            className="pl-9"
          />
        </div>
        {productoLoading && <p className="text-xs text-[var(--body-subtle)]">Buscando...</p>}
        {showResults && productoResults.length > 0 && (
          <div
            className="flex flex-col gap-2 max-h-64 overflow-y-auto"
            onMouseDown={e => e.preventDefault()}
          >
            {productoResults.map((prod, index) => (
              <button
                key={prod.codigo}
                onClick={() => agregarProducto(prod)}
                className={`text-left p-3 rounded-card border flex items-center justify-between gap-3 ${index === highlightedIndex ? 'border-[var(--primary)] bg-[var(--accent)]' : 'border-border hover:bg-[var(--accent)]'}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-[var(--body)]">{prod.codigo}</div>
                  <div className="font-medium text-sm truncate">{prod.detalle}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold">
                    {formatCLP(Number(prod.prcventa))} <span className="text-xs font-normal text-[var(--body-subtle)]">por menor</span>
                  </div>
                  {prod.precio_mayor != null && (
                    <div className="text-xs text-[var(--body-subtle)]">Por mayor: {formatCLP(Number(prod.precio_mayor))}</div>
                  )}
                  <div className="text-xs text-[var(--body-subtle)]">stock: {prod.saldo}</div>
                </div>
                <Plus className="w-4 h-4 text-[var(--success)] shrink-0" />
              </button>
            ))}
          </div>
        )}
        {showResults && !productoLoading && productoQuery.trim().length >= 2 && productoResults.length === 0 && (
          <p className="text-sm text-[var(--body-subtle)]">Sin resultados para &quot;{productoQuery}&quot;</p>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-[var(--muted)] rounded-card" />
          ))}
        </div>
      ) : prenota && prenota.items.length > 0 ? (
        <>
          {(() => {
            const total = prenota.items.reduce(
              (sum: number, item) => sum + Number(item.subtotal),
              0
            );
            return (
              <div className="flex flex-col items-end gap-0.5 px-1">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-sm text-[var(--body)] font-medium">Total nota de venta:</span>
                  <span className="text-lg font-bold text-[var(--heading)]">
                    {formatCLP(total)}
                  </span>
                </div>
              </div>
            );
          })()}
          {/* ─── Estado de pago ─── */}
          {prenota?.saldo_pendiente !== undefined && (
            <div className="flex items-center justify-between gap-2 px-1 py-2 border-t">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-[var(--body)]">
                  Pagado:{' '}
                  <strong className="text-[var(--success)]">
                    {formatCLP(Number(prenota.total_pagado))}
                  </strong>
                </span>
                <span className="text-[var(--body)]">
                  Pendiente:{' '}
                  <strong className={Number(prenota.saldo_pendiente) <= 0.005 ? 'text-[var(--success)]' : 'text-[var(--warning)]'}>
                    {formatCLP(Number(prenota.saldo_pendiente))}
                  </strong>
                </span>
                {prenota?.estado !== 'anulada' && Number(prenota.saldo_pendiente) <= 0.005 && (
                  <Badge variant="success">
                    Pagada
                  </Badge>
                )}
                {prenota?.estado === 'anulada' && (
                  <Badge variant="destructive">
                    Anulada
                  </Badge>
                )}
              </div>
              {prenota?.estado !== 'anulada' && Number(prenota.saldo_pendiente) > 0.005 && (
                <Button
                  variant="success"
                  onClick={() => setPagarOpen(true)}
                >
                  <DollarSign className="w-4 h-4 mr-1" /> Marcar como pagada
                </Button>
              )}
              {prenota?.estado !== 'anulada' && prenota?.cliente_id && Number(prenota.cliente_saldo_favor) > 0.005 && (
                <Button
                  variant="outline"
                  onClick={() => setAplicarSaldoOpen(true)}
                >
                  Aplicar saldo a favor ({formatCLP(Number(prenota.cliente_saldo_favor))})
                </Button>
              )}
              {prenota?.estado !== 'anulada' && Number(prenota.total_pagado) > 0 && (
                <Button
                  variant="destructive"
                  onClick={async () => {
                    if (!confirm('¿Reembolsar esta nota de venta? Esto anulará la nota y revertirá todos los pagos registrados.')) return;
                    try {
                      const res = await fetch(`/api/notas-venta/${id}/reembolsar`, { method: 'POST' });
                      if (res.status === 400) {
                        const body = await res.json();
                        toast.error(body.mensaje || 'No hay pagos registrados para reembolsar');
                        return;
                      }
                      if (res.status === 409) {
                        const body = await res.json();
                        toast.error(body.mensaje || 'La nota cambió, reintentar');
                        return;
                      }
                      if (!res.ok) {
                        toast.error('Error al procesar el reembolso');
                        return;
                      }
                      const body = await res.json();
                      toast.success(`Nota anulada y reembolsada — $${body.total_pagos_reembolsados} devueltos`);
                      await fetchPrenota();
                    } catch {
                      toast.error('Error al procesar el reembolso');
                    }
                  }}
                >
                  <DollarSign className="w-4 h-4 mr-1" /> Reembolsar
                </Button>
              )}
            </div>
          )}
          <PrenotaItemsTable items={prenota.items} onEliminar={eliminarItem} prenotaId={id} onActualizar={fetchPrenota} autoFocusItemId={autoFocusItemId} onAutoFocusConsumed={limpiarAutoFocus} />
        </>
      ) : (
        <p className="text-[var(--body-subtle)]">No hay productos en esta nota de venta aún</p>
      )}
    </div>

      {/* ─── Diálogo de pago ─── */}
      <PagarNotaDialog
        notaId={id}
        saldoPendiente={prenota?.saldo_pendiente ?? 0}
        open={pagarOpen}
        onOpenChange={setPagarOpen}
        onSuccess={fetchPrenota}
      />

      {/* ─── Diálogo de saldo a favor (Slice 3b) ─── */}
      <AplicarSaldoFavorDialog
        notaId={id}
        saldoPendiente={prenota?.saldo_pendiente ?? 0}
        saldoDisponible={Number(prenota?.cliente_saldo_favor ?? 0)}
        open={aplicarSaldoOpen}
        onOpenChange={setAplicarSaldoOpen}
        onSuccess={fetchPrenota}
      />
    </>
  );
}
