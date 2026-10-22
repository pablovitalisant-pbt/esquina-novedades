'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { CalendarDays, ImageOff } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from 'recharts';
import {
  formatUsd, filtrarConStock, topProductos, TOP_METRICAS, TopMetrica,
} from '@/lib/inversion-mercaderia';

type Resumen = {
  costoTotal: number;
  ventaPotencialTotal: number;
  gananciaProyectada: number;
  productosSinCosto: number;
};

type Detalle = {
  codigo: string;
  detalle: string | null;
  saldo: number;
  costo: number | null;
  prcventa: number | null;
  costoTotal: number;
  ventaPotencial: number;
  ganancia: number;
  imagen_url: string | null;
};

type Data = { resumen: Resumen; detalle: Detalle[] } | { sinSnapshot: true };

const hoy = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
const fmtNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const METRICA_DESCRIPCION: Record<TopMetrica, string> = {
  ganancia: 'Si vendieras todo el stock de estos productos al precio de venta actual, esta es la ganancia que te dejaría cada uno.',
  costoTotal: 'Estos son los productos en los que tenés más plata invertida ahora mismo (costo x stock).',
  ventaPotencial: 'Si vendieras todo el stock de estos productos hoy, son los que más generarían en dólares.',
};

// Thumbnail con placeholder genérico — producto sin imagen_url NUNCA es un <img> roto.
function Thumb({ src, className }: { src?: string | null; className?: string }) {
  if (!src) {
    return <ImageOff className="w-5 h-5 text-[var(--body)]/40 shrink-0" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={`rounded-md object-cover shrink-0 ${className ?? 'w-8 h-8'}`}
    />
  );
}

// Tooltip custom de recharts: imagen + codigo + costo + venta potencial.
export function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as { codigo: string; costoTotal: number; ventaPotencial: number; imagen_url: string | null };
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 shadow text-[var(--body)]">
      <div className="flex items-center gap-2 mb-1">
        <Thumb src={p.imagen_url} className="w-6 h-6" />
        <span className="font-medium text-sm">{p.codigo}</span>
      </div>
      <div className="text-xs space-y-0.5">
        <div>Costo: {formatUsd(p.costoTotal)}</div>
        <div>Venta potencial: {formatUsd(p.ventaPotencial)}</div>
      </div>
    </div>
  );
}

export function InversionMercaderiaClient() {
  const { resolvedTheme } = useTheme();
  const [fecha, setFecha] = useState(hoy());
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soloStock, setSoloStock] = useState(true); // default ON
  const [metrica, setMetrica] = useState<TopMetrica>('ganancia'); // default del Director

  const cargar = useCallback(async (f: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inversion-mercaderia?fecha=${f}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setData(null);
        setError(body.error ?? 'Error al cargar el informe');
        return;
      }
      setData(await res.json());
    } catch {
      setError('Error de red al cargar el informe');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar(fecha);
  }, [cargar, fecha]);

  const sinSnapshot = data && 'sinSnapshot' in data && data.sinSnapshot;

  const detalle = data && 'detalle' in data ? data.detalle : [];
  // Un solo universo para tabla + gráfico + Top 10 (un solo toggle).
  const visibles = filtrarConStock(detalle, soloStock);
  const grafico = visibles.map((d) => ({
    codigo: d.codigo,
    costoTotal: d.costoTotal,
    ventaPotencial: d.ventaPotencial,
    imagen_url: d.imagen_url,
  }));
  const top = topProductos(visibles, metrica, 10, false); // ya viene filtrado
  const metricaLabel = TOP_METRICAS.find((m) => m.key === metrica)?.label ?? '';
  const metricaDescripcion = METRICA_DESCRIPCION[metrica];

  // Colores validados con el validador de dataviz skill (claro/oscuro).
  const costoColor = resolvedTheme === 'dark' ? '#3987e5' : '#2a78d6';
  const ventaColor = resolvedTheme === 'dark' ? '#e66767' : '#e34948';

  return (
    <div className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--body)] dark:text-[var(--body)]">Inversión en Mercadería</h1>
          <p className="text-sm text-[var(--body)]/60">Cuánto dinero hay invertido hoy en stock y su venta potencial. Montos en USD.</p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-[var(--body)]/60" />
          <input
            type="date"
            value={fecha}
            max={hoy()}
            onChange={(e) => e.target.value && setFecha(e.target.value)}
            className="px-3 py-2 rounded-full border border-[var(--border)] bg-[var(--card)] text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-4 text-sm text-[var(--destructive)]">
          {error}
        </div>
      )}

      {loading && (
        <div data-testid="loading-skeleton" className="space-y-6" aria-busy="true">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-[var(--muted)] animate-pulse" />
            ))}
          </div>
          <div className="h-72 rounded-lg bg-[var(--muted)] animate-pulse" />
          <div className="h-64 rounded-lg bg-[var(--muted)] animate-pulse" />
        </div>
      )}

      {!loading && sinSnapshot && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-center">
          <p className="text-[var(--body)]">No hay snapshot para esa fecha.</p>
          <p className="text-sm text-[var(--body)]/60 mt-1">
            El snapshot diario se captura a las 22:55 (hora Bolivia) desde que se activó este módulo.
          </p>
        </div>
      )}

      {!loading && data && 'resumen' in data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm text-[var(--body)]/60">Invertido en stock</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{formatUsd(data.resumen.costoTotal)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm text-[var(--body)]/60">Venta potencial</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{formatUsd(data.resumen.ventaPotencialTotal)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm text-[var(--body)]/60">Ganancia proyectada</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-[var(--primary)]">{formatUsd(data.resumen.gananciaProyectada)}</p>
                <p className="text-xs text-[var(--body)]/60 mt-1">
                  {data.resumen.productosSinCosto > 0
                    ? `${data.resumen.productosSinCosto} producto(s) sin costo registrado (excluidos)`
                    : 'Todos los productos tienen costo registrado'}
                </p>
              </CardContent>
            </Card>
          </div>

          {grafico.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Costo vs Venta potencial por producto</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={grafico} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="codigo" stroke="var(--body)" tick={{ fontSize: 11 }} />
                      <YAxis stroke="var(--body)" tick={{ fontSize: 11 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend />
                      <Line type="monotone" dataKey="costoTotal" name="Costo" stroke={costoColor} />
                      <Line type="monotone" dataKey="ventaPotencial" name="Venta potencial" stroke={ventaColor} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top 10 — entre el gráfico y la tabla */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base">Top 10 — productos que más aportan</CardTitle>
                <p className="text-sm text-[var(--body)]/60 mt-1">{metricaDescripcion}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--body)]/60">Métrica</span>
                <select
                  value={metrica}
                  onChange={(e) => setMetrica(e.target.value as TopMetrica)}
                  className="px-3 py-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] text-sm"
                >
                  {TOP_METRICAS.map((m) => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent>
              {top.length === 0 ? (
                <p className="text-sm text-[var(--body)]/60">Sin productos con stock.</p>
              ) : (
                <ol className="space-y-1 text-sm">
                  {top.map((p, i) => (
                    <li key={p.codigo} className="flex items-center justify-between gap-4 py-1 border-b border-[var(--border)]/50">
                      <span className="flex items-center gap-3">
                        <span className="w-5 text-[var(--body)]/50">{i + 1}.</span>
                        <Thumb src={p.imagen_url} />
                        <span className="font-medium">{p.codigo}</span>
                        <span className="text-[var(--body)]/60 truncate max-w-[40ch]">{p.detalle ?? ''}</span>
                      </span>
                      <span className="font-semibold">{formatUsd(p[metrica])}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-base">Detalle por producto</CardTitle>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={soloStock}
                  onChange={(e) => setSoloStock(e.target.checked)}
                  className="accent-[var(--primary)]"
                />
                Solo con stock (saldo &gt; 0)
              </label>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-[var(--body)]/60">
                      <th className="py-2 pr-4">Producto</th>
                      <th className="py-2 pr-4">Detalle</th>
                      <th className="py-2 pr-4 text-right">Saldo</th>
                      <th className="py-2 pr-4 text-right">Costo</th>
                      <th className="py-2 pr-4 text-right">P. venta</th>
                      <th className="py-2 pr-4 text-right">Costo total</th>
                      <th className="py-2 pr-4 text-right">Venta pot.</th>
                      <th className="py-2 text-right">Ganancia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((d) => (
                      <tr key={d.codigo} className="border-b border-[var(--border)]/50">
                        <td className="py-2 pr-4">
                          <span className="flex items-center gap-2">
                            <Thumb src={d.imagen_url} />
                            <span className="font-medium">{d.codigo}</span>
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-[var(--body)]/80">{d.detalle ?? '—'}</td>
                        <td className="py-2 pr-4 text-right">{d.saldo}</td>
                        <td className="py-2 pr-4 text-right">{d.costo === null ? '—' : fmtNum(d.costo)}</td>
                        <td className="py-2 pr-4 text-right">{d.prcventa === null ? '—' : fmtNum(d.prcventa)}</td>
                        <td className="py-2 pr-4 text-right">{formatUsd(d.costoTotal)}</td>
                        <td className="py-2 pr-4 text-right">{formatUsd(d.ventaPotencial)}</td>
                        <td className="py-2 text-right">{formatUsd(d.ganancia)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
