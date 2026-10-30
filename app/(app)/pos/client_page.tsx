'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus, Printer, Trash2, Search, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import { PosClienteDialog, type ClientePos } from '@/components/PosClienteDialog';
import { PosCobrarDialog } from '@/components/PosCobrarDialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { EMPRESA } from '@/lib/empresa';
import { formatCLP } from '@/lib/utils';
import type { SessionProp } from '@/types';

// Clave de la nota en curso: al recargar, el POS retoma la misma nota.
const LS_KEY = 'pos-nota-id';

type Producto = {
  codigo: string;
  detalle: string | null;
  imagen_url: string | null;
  empresa_id: number;
  prcventa: number;
  precio_mayor: number | null;
  saldo: number;
  categoria: string | null;
};

type ItemNota = {
  id: string;
  codigo: string;
  descripcion: string | null;
  modalidad: string | null;
  unidades: number;
  precio: number;
  subtotal: number;
};

export function PosPage({ session }: { session: SessionProp }) {
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [productos, setProductos] = useState<Producto[]>([]);
  // Texto al que corresponden los resultados cargados: Enter nunca resuelve
  // contra resultados de una búsqueda anterior.
  const [resultadosDe, setResultadosDe] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [cat, setCat] = useState('');

  const [notaId, setNotaId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemNota[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [cobrarOpen, setCobrarOpen] = useState(false);

  // pos3 — cliente de la venta (null = sin elegir → mesón al crear la nota).
  const [cliente, setCliente] = useState<ClientePos | null>(null);
  const [clienteOpen, setClienteOpen] = useState(false);
  const [mesonFaltante, setMesonFaltante] = useState(false);
  // Cobros ya registrados en esta sesión (pago parcial → próximo COBRAR usa el resto).
  const [pagado, setPagado] = useState(0);
  // Saldo que informa la API de la nota (incluye pagos previos); null = usar total.
  const [saldoNota, setSaldoNota] = useState<number | null>(null);
  const mesonIdRef = useRef<string | null>(null);

  // Teclado: producto resaltado en la grilla y foco del buscador.
  const [highlighted, setHighlighted] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const cargarNota = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/notas-venta/${id}`);
      if (res.status === 404) {
        setNotaId(null);
        setItems([]);
        setSaldoNota(null);
        try { localStorage.removeItem(LS_KEY); } catch { /* sin storage */ }
        return;
      }
      if (!res.ok) { toast.error('No se pudo cargar la nota'); return; }
      const data = await res.json();
      setItems(data.items ?? []);
      setSaldoNota(typeof data.saldo_pendiente === 'number' ? data.saldo_pendiente : null);
    } catch {
      toast.error('No se pudo cargar la nota');
    }
  }, []);

  // Retoma la nota en curso guardada en localStorage (si sigue existiendo).
  useEffect(() => {
    let id: string | null = null;
    try { id = localStorage.getItem(LS_KEY); } catch { id = null; }
    if (id) { setNotaId(id); cargarNota(id); }
  }, [cargarNota]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/categorias');
        if (res.ok) setCategorias(((await res.json()) as { nombre: string }[]).map(c => c.nombre));
      } catch { /* chips opcionales */ }
    })();
  }, []);

  // Búsqueda con debounce; sin texto lista el catálogo completo (grilla inicial).
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/productos?search=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          setProductos((await res.json()).data ?? []);
          setResultadosDe(query.trim().toLowerCase());
          setHighlighted(0);
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === 'AbortError')) toast.error('No se pudo buscar productos');
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  // Bloquea toda mutación mientras hay un request en vuelo (anti doble click/Enter).
  const conBloqueo = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try { await fn(); } finally { busyRef.current = false; setBusy(false); }
  };

  const recordarNota = (id: string) => {
    setNotaId(id);
    try { localStorage.setItem(LS_KEY, id); } catch { /* sin storage */ }
  };

  // Cliente genérico (RUT 66.666.666-6), resuelto por RUT y cacheado en memoria.
  // Si no existe/falla, la venta sigue: la nota queda sin cliente.
  const obtenerClienteMeson = async (): Promise<string | null> => {
    if (mesonIdRef.current) return mesonIdRef.current;
    try {
      const res = await fetch('/api/clientes?rut=66.666.666-6');
      if (res.ok) {
        const id = (await res.json())?.data?.[0]?.id;
        if (id) {
          mesonIdRef.current = String(id);
          setMesonFaltante(false);
          return mesonIdRef.current;
        }
      }
    } catch { /* cae al aviso discreto */ }
    setMesonFaltante(true);
    return null;
  };

  const elegirCliente = async (c: ClientePos) => {
    setCliente(c);
    setMesonFaltante(false);
    if (!notaId) return;
    try {
      const res = await fetch(`/api/notas-venta/${notaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: c.id }),
      });
      if (!res.ok) toast.error('No se pudo asignar el cliente');
    } catch {
      toast.error('No se pudo asignar el cliente');
    }
  };

  const agregar = (prod: Producto) => conBloqueo(async () => {
    let id = notaId;
    // Ya está en la nota con la misma modalidad: suma +1 a esa línea.
    const existente = id ? items.find(i => i.codigo === prod.codigo && i.modalidad !== 'mayor') : undefined;
    if (id && existente) {
      const res = await fetch(`/api/notas-venta/${id}/items/${existente.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unidades: Number(existente.unidades) + 1 }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'No se pudo actualizar la cantidad');
        return;
      }
      setSelected(existente.id);
      setQuery('');
      await cargarNota(id);
      return;
    }
    if (!id) {
      // Sin cliente elegido → Cliente de mesón. Si no existe, nota sin cliente.
      const clienteId = cliente?.id ?? await obtenerClienteMeson();
      const res = await fetch('/api/notas-venta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clienteId ? { cliente_id: clienteId } : {}),
      });
      if (!res.ok) { toast.error('No se pudo crear la nota de venta'); return; }
      id = String((await res.json()).id);
      recordarNota(id);
    }
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
      toast.error(err.error || 'No se pudo agregar el producto');
      return;
    }
    const item = await res.json();
    setSelected(item.id);
    setQuery('');
    await cargarNota(id);
  });

  const cambiarCantidad = (item: ItemNota, delta: number) => {
    if (!notaId) return;
    const nueva = Number(item.unidades) + delta;
    if (nueva < 1) return;
    conBloqueo(async () => {
      const res = await fetch(`/api/notas-venta/${notaId}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unidades: nueva }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'No se pudo actualizar la cantidad');
        return;
      }
      setSelected(item.id);
      await cargarNota(notaId);
    });
  };

  // El servidor ajusta el precio de la línea a la modalidad pedida.
  const alternarModalidad = (item: ItemNota) => {
    if (!notaId) return;
    const modalidad = item.modalidad === 'mayor' ? 'detalle' : 'mayor';
    conBloqueo(async () => {
      const res = await fetch(`/api/notas-venta/${notaId}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modalidad }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'No se pudo cambiar la modalidad');
        return;
      }
      setSelected(item.id);
      await cargarNota(notaId);
    });
  };

  const quitar = (item: ItemNota) => {
    if (!notaId) return;
    conBloqueo(async () => {
      const res = await fetch(`/api/notas-venta/${notaId}/items/${item.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        toast.error('No se pudo quitar el producto');
        return;
      }
      if (selected === item.id) setSelected(null);
      await cargarNota(notaId);
    });
  };

  const resetearVenta = () => {
    setNotaId(null);
    setItems([]);
    setSelected(null);
    setQuery('');
    setCliente(null);
    setMesonFaltante(false);
    setPagado(0);
    setSaldoNota(null);
    try { localStorage.removeItem(LS_KEY); } catch { /* sin storage */ }
  };

  const nuevaVenta = () => {
    if (items.length > 0 && !confirm('¿Descartar la venta en curso y empezar una nueva?')) return;
    resetearVenta();
  };

  const cobrar = () => {
    if (!notaId || items.length === 0 || busy) return;
    setCobrarOpen(true);
  };

  const imprimir = () => {
    if (notaId) router.push(`/notas-venta/${notaId}`);
  };

  const total = items.reduce((sum, i) => sum + Number(i.subtotal ?? 0), 0);

  const productosPorCodigo = useMemo(
    () => new Map(productos.map(p => [p.codigo, p])),
    [productos]
  );
  // Sin dato del producto se deja intentar: el servidor rechaza el cambio.
  const tienePrecioMayor = (codigo: string) => {
    const p = productosPorCodigo.get(codigo);
    return p ? Number(p.precio_mayor) > 0 : true;
  };

  const visibles = cat ? productos.filter(p => p.categoria === cat) : productos;

  // ─── Teclado (todo el POS manejable sin mouse) ───────────────────────
  // Enter resuelve contra el texto ACTUAL: exacto → resaltado de ESOS
  // resultados → (si están viejos/en vuelo) se piden de nuevo → nada.
  // Nunca cae al primer ítem de la grilla sin filtrar.
  const agregarDesdeBusqueda = async () => {
    const texto = query.trim();
    const q = texto.toLowerCase();
    if (!q) {
      const prod = visibles[Math.min(highlighted, visibles.length - 1)];
      if (prod) agregar(prod);
      return;
    }
    let lista = productos;
    let idx = Math.min(highlighted, Math.max(lista.length - 1, 0));
    if (resultadosDe !== q) {
      try {
        const res = await fetch(`/api/productos?search=${encodeURIComponent(texto)}`);
        lista = res.ok ? ((await res.json()).data ?? []) : [];
      } catch {
        toast.error('No se pudo buscar productos');
        return;
      }
      setProductos(lista);
      setResultadosDe(q);
      setHighlighted(0);
      idx = 0;
    }
    const exacto = lista.find(p => p.codigo.toLowerCase() === q);
    const filtrados = cat ? lista.filter(p => p.categoria === cat) : lista;
    const prod = exacto ?? filtrados[Math.min(idx, Math.max(filtrados.length - 1, 0))];
    if (!prod) { toast.error(`Sin resultados para ${texto}`); return; }
    agregar(prod);
  };

  const lineaSeleccionada = () => items.find(i => i.id === selected) ?? items[items.length - 1];

  const atajosRef = useRef<{
    vacia: boolean;
    bloqueado: boolean;
    escribir: (ch: string) => void;
    mover: (d: number) => void;
    cantidad: (d: number) => void;
    alternar: () => void;
    quitar: () => void;
    escape: () => void;
    cobrar: () => void;
    cambiarCliente: () => void;
    agregar: () => void;
  } | null>(null);

  useEffect(() => {
    atajosRef.current = {
      vacia: query.trim() === '',
      bloqueado: cobrarOpen || clienteOpen,
      escribir: (ch) => {
        searchRef.current?.focus();
        setQuery(q => q + ch);
      },
      mover: (d) => setHighlighted(i => Math.max(0, Math.min(i + d, visibles.length - 1))),
      cantidad: (d) => { const l = lineaSeleccionada(); if (l) cambiarCantidad(l, d); },
      alternar: () => { const l = lineaSeleccionada(); if (l) alternarModalidad(l); },
      quitar: () => { const l = lineaSeleccionada(); if (l) quitar(l); },
      escape: () => { setQuery(''); setSheetOpen(false); },
      cobrar,
      cambiarCliente: () => setClienteOpen(true),
      agregar: () => { void agregarDesdeBusqueda(); },
    };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const t = e.target as HTMLElement | null;
      const enCampo = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const enBuscador = t === searchRef.current;
      // Otro campo del panel (p.ej. monto del cobro): ningún atajo.
      if (enCampo && !enBuscador) return;
      const a = atajosRef.current;
      if (!a || a.bloqueado) return;

      const k = e.key;
      const mas = k === '+' || k === 'Add' || e.code === 'NumpadAdd';
      const menos = k === '-' || k === 'Subtract' || e.code === 'NumpadSubtract';
      // +/- son cantidad SOLO con la búsqueda vacía; si hay texto (o es una
      // tecla imprimible) se escriben: un lector puede mandar códigos con '-'.
      if (a.vacia && (mas || menos)) {
        e.preventDefault();
        a.cantidad(mas ? 1 : -1);
        return;
      }
      if (k === 'F4') { e.preventDefault(); a.cambiarCliente(); return; }
      if ((k === 'Enter' && e.ctrlKey) || k === 'F9') { e.preventDefault(); a.cobrar(); return; }
      // Dentro del buscador, Enter/flechas/Esc los maneja el propio input.
      if (enBuscador) return;

      if (k === 'F2') { e.preventDefault(); a.alternar(); }
      else if (k === 'Delete') { e.preventDefault(); a.quitar(); }
      else if (k === 'Escape') { e.preventDefault(); a.escape(); }
      else if (k === 'ArrowDown') { e.preventDefault(); a.mover(1); }
      else if (k === 'ArrowUp') { e.preventDefault(); a.mover(-1); }
      else if (k === 'Enter') { e.preventDefault(); a.agregar(); }
      else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        a.escribir(k);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fila = (item: ItemNota) => {
    const mayor = item.modalidad === 'mayor';
    return (
      <li
        key={item.id}
        data-testid={`pos-linea-${item.codigo}`}
        onClick={() => setSelected(item.id)}
        className={`flex flex-col gap-2 border-b border-[var(--border)] py-3 last:border-b-0 ${
          selected === item.id ? 'bg-[var(--primary)]/10' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight truncate">{item.descripcion ?? item.codigo}</p>
            <p className="text-xs text-[var(--body-subtle)]">{item.codigo}</p>
          </div>
          <p className="font-extrabold text-[var(--heading)] whitespace-nowrap">{formatCLP(Number(item.subtotal))}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            aria-label={`Quitar una unidad de ${item.descripcion ?? item.codigo}`}
            disabled={busy || Number(item.unidades) <= 1}
            onClick={(e) => { e.stopPropagation(); cambiarCantidad(item, -1); }}
            className="h-12 w-12"
          >
            <Minus className="w-5 h-5" />
          </Button>
          <span className="min-w-10 text-center text-xl font-extrabold" data-testid={`pos-cantidad-${item.codigo}`}>
            {Number(item.unidades)}
          </span>
          <Button
            size="icon"
            variant="outline"
            aria-label={`Agregar una unidad de ${item.descripcion ?? item.codigo}`}
            disabled={busy}
            onClick={(e) => { e.stopPropagation(); cambiarCantidad(item, 1); }}
            className="h-12 w-12"
          >
            <Plus className="w-5 h-5" />
          </Button>
          <button
            type="button"
            disabled={busy || (!mayor && !tienePrecioMayor(item.codigo))}
            onClick={(e) => { e.stopPropagation(); alternarModalidad(item); }}
            className={`ml-auto h-12 rounded-full border px-3 text-xs font-bold tracking-wide disabled:opacity-40 ${
              mayor
                ? 'bg-[var(--primary)] text-primary-foreground border-transparent'
                : 'border-[var(--border)] text-[var(--body)]'
            }`}
            aria-label="Alternar precio por menor o por mayor"
          >
            {mayor ? 'POR MAYOR' : 'POR MENOR'}
          </button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Quitar ${item.descripcion ?? item.codigo}`}
            disabled={busy}
            onClick={(e) => { e.stopPropagation(); quitar(item); }}
            className="h-12 w-12 text-[var(--destructive)]"
          >
            <Trash2 className="w-5 h-5" />
          </Button>
        </div>
        <p className="text-xs text-[var(--body-subtle)]">
          {formatCLP(Number(item.precio))} / unidad
        </p>
      </li>
    );
  };

  const panelNota = (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-[var(--body-subtle)]">Cliente</p>
          <p className="font-bold truncate">{cliente?.nombre ?? 'Cliente de mesón'}</p>
          {mesonFaltante && (
            <p className="text-[11px] text-[var(--destructive)]" data-testid="pos-meson-faltante">
              Sin Cliente de mesón: la nota quedó sin cliente.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <Button
            variant="outline"
            className="h-12 px-4 text-base font-bold"
            onClick={() => setClienteOpen(true)}
            disabled={busy}
          >
            Cambiar cliente
          </Button>
          <Button variant="ghost" className="h-12 px-4" onClick={nuevaVenta} disabled={busy || !notaId}>
            Nueva venta
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--body-subtle)] py-4">Agrega productos para armar la venta.</p>
      ) : (
        <ul className="flex-1 overflow-y-auto min-h-0">
          {items.map(fila)}
        </ul>
      )}

      <div className="mt-auto border-t border-[var(--border)] pt-3">
        <div className="flex items-end justify-between gap-2">
          <span className="text-sm font-medium text-[var(--body)]">Total</span>
          <span className="text-4xl font-black tracking-tight text-[var(--heading)]" data-testid="pos-total">
            {formatCLP(total)}
          </span>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <Button
            variant="brand"
            className="h-16 text-2xl font-black"
            disabled={!notaId || items.length === 0 || busy}
            onClick={cobrar}
          >
            <CreditCard className="w-6 h-6 mr-2" /> COBRAR
          </Button>
          <Button
            variant="outline"
            className="h-14 text-lg font-bold"
            disabled={!notaId}
            onClick={imprimir}
          >
            <Printer className="w-5 h-5 mr-2" /> Guardar / Imprimir
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-center text-[var(--body-subtle)]">
          Enter agrega · +/− cantidad · F2 MENOR/MAYOR · F4 cliente · Supr quita · F9 cobrar · Esc limpiar
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6 lg:items-start">
      {/* ─── Izquierda: búsqueda + categorías + grilla ─── */}
      {/* pb: la barra fija "items / total / COBRAR" no tapa el último producto */}
      <div className="flex flex-col gap-3 min-w-0 pb-40 lg:pb-0">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-[var(--body-subtle)]" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Buscar por código o descripción…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(i => Math.min(i + 1, visibles.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(i => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); void agregarDesdeBusqueda(); }
              else if (e.key === 'Escape') { e.preventDefault(); setQuery(''); }
            }}
            disabled={busy}
            className="w-full h-14 pl-14 pr-4 rounded-full border border-[var(--border)] bg-[var(--card)] text-lg font-medium focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>

        {categorias.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {['', ...categorias].map(c => (
              <button
                key={c || 'todas'}
                type="button"
                onClick={() => { setCat(c); setHighlighted(0); }}
                className={`h-10 px-4 rounded-full border text-sm font-bold whitespace-nowrap ${
                  cat === c
                    ? 'bg-[var(--primary)] text-primary-foreground border-transparent'
                    : 'border-[var(--border)] text-[var(--body)] hover:bg-[var(--muted)]'
                }`}
              >
                {c || 'Todas'}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {visibles.map((p, i) => (
            <button
              key={p.codigo}
              type="button"
              data-testid={`pos-producto-${p.codigo}`}
              disabled={busy}
              onClick={() => agregar(p)}
              className={`text-left bg-[var(--card)] border rounded-card overflow-hidden hover:brightness-105 focus:outline-none transition disabled:opacity-60 ${
                i === highlighted ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]' : 'border-[var(--border)]'
              }`}
            >
              <div className="relative aspect-square bg-[var(--muted)]">
                <ImageWithFallback
                  src={p.imagen_url}
                  codigo={p.codigo}
                  empresaSlug={EMPRESA.slug}
                  alt={p.detalle ?? p.codigo}
                  fill
                />
              </div>
              <div className="p-3">
                <p className="font-bold text-sm leading-tight line-clamp-2 min-h-10">{p.detalle ?? p.codigo}</p>
                <p className="text-[10px] uppercase tracking-wide text-[var(--body-subtle)] mt-1">Por menor</p>
                <p className="text-lg font-extrabold text-[var(--heading)]">{formatCLP(Number(p.prcventa))}</p>
                <p className="text-xs text-[var(--body-subtle)]">stock {Number(p.saldo)}</p>
              </div>
            </button>
          ))}
        </div>
        {visibles.length === 0 && (
          <p className="text-sm text-[var(--body-subtle)]">Sin productos para &quot;{query}&quot;.</p>
        )}
      </div>

      {/* ─── Derecha: nota (desktop/tablet) ─── */}
      <aside className="hidden lg:flex flex-col bg-[var(--card)] border border-[var(--border)] rounded-card p-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]">
        {panelNota}
      </aside>

      {/* ─── Móvil: barra fija + nota en Sheet ─── */}
      <div className="lg:hidden fixed bottom-16 left-0 right-0 z-40 p-3 bg-[var(--card)]/95 backdrop-blur border-t border-[var(--border)]">
        <button
          type="button"
          data-testid="pos-barra-movil"
          onClick={() => setSheetOpen(true)}
          className="w-full h-16 rounded-full bg-[var(--primary)] text-primary-foreground font-black text-lg px-6 flex items-center justify-between gap-2"
        >
          <span>{items.reduce((s, i) => s + Number(i.unidades), 0)} items</span>
          <span>{formatCLP(total)}</span>
          <span>COBRAR</span>
        </button>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger className="hidden" />
        <SheetContent side="right" className="w-full sm:max-w-md p-4 flex flex-col">
          <SheetHeader className="p-0">
            <SheetTitle className="text-lg font-extrabold">Venta en curso</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0">{panelNota}</div>
        </SheetContent>
      </Sheet>

      <PosClienteDialog open={clienteOpen} onOpenChange={setClienteOpen} onSelect={elegirCliente} />

      <PosCobrarDialog
        open={cobrarOpen}
        onOpenChange={setCobrarOpen}
        notaId={notaId}
        saldoPendiente={Math.max(0, (saldoNota ?? total) - pagado)}
        usuarioId={session?.user?.id}
        onNuevaVenta={resetearVenta}
        onPagado={aplicado => setPagado(p => p + aplicado)}
      />
    </div>
  );
}
