'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { OBS_STOCK_INICIAL, type MovimientoHistorial, type ProductoHistorial, type ResumenHistorial } from '@/lib/historial';

interface RespuestaHistorial {
  producto: ProductoHistorial;
  movimientos: MovimientoHistorial[];
  resumen: ResumenHistorial;
}

interface ResultadoBusqueda {
  codigo: string;
  detalle: string | null;
  saldo: number;
}

function formatFechaHora(value: string): string {
  const fecha = new Date(value);
  if (Number.isNaN(fecha.getTime())) return value;
  return fecha.toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function etiqueta(m: MovimientoHistorial): string {
  if (m.tipo === 'ingreso') return m.detalle === OBS_STOCK_INICIAL ? 'Stock inicial' : 'Ingreso';
  if (m.tipo === 'conciliacion') return 'Ajuste de conteo';
  if (m.tipo === 'stock_inicial') return 'Stock inicial (sin registro)';
  if (m.tipo === 'reserva') return m.estado === 'vigente' ? 'Reservado en pedido' : 'Pedido online liberado';
  return m.estado === 'anulada' ? 'Venta anulada' : 'Venta';
}

function motivoSinEfecto(m: MovimientoHistorial): string {
  if (m.tipo === 'venta') return 'No cuenta: la nota está anulada.';
  if (m.tipo === 'reserva') return 'No cuenta: el pedido se liberó y el stock volvió.';
  return 'No cuenta: no movió el stock.';
}

const conSigno = (n: number) => (n > 0 ? `+${n}` : String(n));

function UsuarioLinea({ mov }: { mov: MovimientoHistorial }) {
  const texto = mov.usuario || (mov.tipo === 'reserva' ? 'Tienda online' : null);
  if (!texto) return null;
  return <div className="text-xs text-[var(--body-subtle)]">{texto}</div>;
}

export function HistorialClient({ codigoInicial }: { codigoInicial: string }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [resultados, setResultados] = useState<ResultadoBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [codigo, setCodigo] = useState(codigoInicial);
  const [datos, setDatos] = useState<RespuestaHistorial | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 160);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    setErrorBusqueda(null);
    fetch(`/api/productos?search=${encodeURIComponent(q)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('búsqueda'))))
      .then((body) => { if (!cancelado) setResultados(body.data ?? []); })
      .catch(() => {
        if (cancelado) return;
        setResultados([]);
        setErrorBusqueda('No se pudieron buscar productos.');
      })
      .finally(() => { if (!cancelado) setBuscando(false); });
    return () => { cancelado = true; };
  }, [debounced]);

  useEffect(() => {
    if (!codigo) {
      setDatos(null);
      setError(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);
    fetch(`/api/productos/${encodeURIComponent(codigo)}/historial`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'No se pudo cargar el historial.');
        return body;
      })
      .then((body) => { if (!cancelado) setDatos(body); })
      .catch((err) => {
        if (cancelado) return;
        setDatos(null);
        setError(`No se pudo cargar el historial: ${err?.message || 'revisa tu conexión.'}`);
      })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [codigo, recarga]);

  const elegir = (nuevo: string) => {
    setCodigo(nuevo);
    setSearch('');
    setDebounced('');
    setResultados([]);
    router.replace(`/bodega/historial?codigo=${encodeURIComponent(nuevo)}`);
  };

  const acumulados = useMemo(() => {
    let saldo = 0;
    return (datos?.movimientos ?? []).map((m) => (saldo += m.efecto));
  }, [datos]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-1 pb-12 fade-in zoom-in-95 duration-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black text-[var(--primary)]">Historial de movimientos</h1>
        <a href="/bodega" className="text-sm font-medium text-[var(--body)] underline underline-offset-4">
          Volver a bodega
        </a>
      </div>

      <div>
        <label htmlFor="buscar-producto" className="stat-label mb-1.5 block">Buscar producto</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--body-subtle)]" />
          <Input
            id="buscar-producto"
            type="search"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar código o descripción..."
            className="h-12 pl-10 text-base"
          />
        </div>
        <p className="mt-1 text-xs text-[var(--body-subtle)]">Escribe al menos 2 letras.</p>
        {buscando && <p className="mt-2 text-sm text-[var(--body)]">Buscando...</p>}
        {errorBusqueda && <p className="mt-2 text-sm text-[var(--fg-danger-strong)]">{errorBusqueda}</p>}
        {resultados.length > 0 && (
          <ul className="mt-2 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {resultados.map((p) => (
              <li key={p.codigo}>
                <button
                  type="button"
                  onClick={() => elegir(p.codigo)}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <span className="font-mono text-sm font-semibold text-[var(--primary)]">{p.codigo}</span>
                  <span className="break-words text-sm text-[var(--body)]">{p.detalle || 'Sin descripción'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {debounced.trim().length >= 2 && !buscando && resultados.length === 0 && !errorBusqueda && (
          <p className="mt-2 text-sm text-[var(--body)]">Sin coincidencias.</p>
        )}
      </div>

      {!codigo && (
        <p className="py-10 text-center text-sm text-[var(--body)]">Busca un producto por código o descripción para ver todo lo que entró y salió.</p>
      )}

      {cargando && <p className="py-6 text-center text-sm text-[var(--body)] animate-pulse">Cargando historial...</p>}

      {error && (
        <div className="flex flex-col items-center gap-3 rounded-card border border-[var(--border)] bg-[var(--card)] p-6 text-center">
          <p className="text-sm text-[var(--fg-danger-strong)]">{error}</p>
          <Button variant="outline" size="sm" onClick={() => setRecarga((n) => n + 1)}>Reintentar</Button>
        </div>
      )}

      {datos && !cargando && !error && (
        <>
          <div className="rounded-card border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-1">
              <span className="font-mono text-sm font-semibold text-[var(--primary)]">{datos.producto.codigo}</span>
              <span className="break-words text-sm font-medium text-[var(--body)]">{datos.producto.detalle || 'Sin descripción'}</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {([
                ['entraron', 'Entraron', datos.resumen.ingresado + (datos.resumen.stock_inicial_inferido ?? 0)],
                ['vendido', 'Se vendieron', datos.resumen.vendido],
                ['ajustes', 'Ajustes de conteo', datos.resumen.ajustes],
                ['reservado', 'Reservado en pedidos', datos.resumen.reservado],
                ['stock', 'Stock en el sistema', datos.resumen.saldo_actual],
              ] as const).map(([clave, label, valor]) => (
                <div key={clave} className="rounded-lg bg-[var(--muted)] px-3 py-2">
                  <div className="stat-label">{label}</div>
                  <div className="text-xl font-bold text-[var(--body)]" data-testid={`resumen-${clave}`}>{valor}</div>
                </div>
              ))}
            </div>

            {datos.resumen.diferencia != null && datos.resumen.diferencia !== 0 && (
              <p role="alert" className="mt-3 rounded-lg border border-[var(--border-danger-subtle)] bg-[var(--muted)] px-3 py-2 text-sm font-medium text-[var(--fg-danger-strong)]">
                Hay una diferencia de {datos.resumen.diferencia} unidades: el stock del sistema no cuadra con los movimientos registrados.
              </p>
            )}
            {datos.resumen.truncado && (
              <p className="mt-3 text-xs text-[var(--body-subtle)]">Mostrando los primeros 500 movimientos</p>
            )}
          </div>

          <ol className="flex flex-col">
            {datos.movimientos.map((mov, i) => (
              <li
                key={`${mov.fecha}-${i}`}
                data-testid="movimiento"
                className={`border-b border-[var(--border)] py-3 ${mov.efecto === 0 ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[var(--body-subtle)]">{formatFechaHora(mov.fecha)}</div>
                    <div className="text-sm font-semibold text-[var(--body)]">{etiqueta(mov)}</div>
                    {mov.detalle && <div className="break-words text-xs text-[var(--body-subtle)]">{mov.detalle}</div>}
                    <UsuarioLinea mov={mov} />
                    {mov.efecto === 0 && <div className="mt-0.5 text-xs italic text-[var(--body-subtle)]">{motivoSinEfecto(mov)}</div>}
                    {mov.referencia?.href && (
                      <a href={mov.referencia.href} className="mt-1 inline-block text-xs font-medium text-[var(--primary)] underline underline-offset-2">
                        Ver nota
                      </a>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-bold text-[var(--body)]">{conSigno(mov.cantidad)}</div>
                    <div className="text-xs font-medium text-[var(--body-subtle)]">queda {acumulados[i]}</div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
