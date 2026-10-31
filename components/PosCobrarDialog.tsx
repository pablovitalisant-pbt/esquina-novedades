'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Delete, Loader2, MessageCircle, Plus, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cargarCuentasActivas, ErrorPago, pagarNota } from '@/lib/api-pagos';
import { formatCLP } from '@/lib/utils';
import type { Cuenta, FormaPago } from '@/types';

const FORMAS: { id: FormaPago; tecla: string; label: string }[] = [
  { id: 'efectivo', tecla: '1', label: 'EFECTIVO' },
  { id: 'tarjeta', tecla: '2', label: 'TARJETA' },
  { id: 'transferencia', tecla: '3', label: 'TRANSFERENCIA' },
  { id: 'cheque', tecla: '4', label: 'CHEQUE' },
];

type Resultado = { aplicado: number; vuelto: number; restante: number; forma: FormaPago };

/** pos3 — panel COBRAR del POS. */
export function PosCobrarDialog({
  open,
  onOpenChange,
  notaId,
  saldoPendiente,
  usuarioId,
  onNuevaVenta,
  onPagado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notaId: string | null;
  saldoPendiente: number;
  usuarioId?: string | number;
  onNuevaVenta: () => void;
  onPagado?: (aplicado: number) => void;
}) {
  const router = useRouter();
  const [monto, setMonto] = useState('');
  const [forma, setForma] = useState<FormaPago>('efectivo');
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cuentaId, setCuentaId] = useState(0);
  const [predeterminada, setPredeterminada] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const montoRef = useRef<HTMLInputElement>(null);
  const loadingRef = useRef(false);
  const claveCuenta = `pos-cuenta-default-${usuarioId ?? 'anon'}`;

  const leerPredeterminada = () => {
    try { return Number(localStorage.getItem(claveCuenta)) || 0; } catch { return 0; }
  };

  useEffect(() => {
    if (!open) return;
    loadingRef.current = false;
    setLoading(false);
    setError('');
    setResultado(null);
    setForma('efectivo');
    setMonto(String(Math.round(saldoPendiente)));
    setCuentas([]);
    setCuentaId(0);
    const pref = leerPredeterminada();
    setPredeterminada(pref);
    setTimeout(() => { montoRef.current?.focus(); montoRef.current?.select(); }, 0);

    (async () => {
      try {
        const lista = await cargarCuentasActivas({ soloSiOk: true });
        setCuentas(lista);
        setCuentaId(lista.some(c => c.id === pref) ? pref : (lista[0]?.id ?? 0));
      } catch {
        setCuentas([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, usuarioId]);

  const saldo = Math.round(saldoPendiente);
  const montoNum = Number(monto || 0);
  const aplicado = Math.min(montoNum, saldo);
  const vuelto = forma === 'efectivo' && montoNum > saldo ? montoNum - saldo : 0;
  const restante = Math.max(0, saldo - aplicado);

  const confirmar = async () => {
    if (loadingRef.current) return;
    if (!notaId) { setError('La nota no está guardada todavía.'); return; }
    if (cuentaId === 0) { setError('Selecciona una cuenta de caja.'); return; }
    if (montoNum <= 0) { setError('El monto debe ser mayor a 0.'); return; }
    if (forma !== 'efectivo' && montoNum > saldo) {
      setError(`Para ${forma} el monto no puede superar el saldo (${formatCLP(saldo)}).`);
      return;
    }
    const montoEnviar = aplicado;
    loadingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const data = await pagarNota<{
        monto_aplicado?: number;
        saldo_pendiente_restante?: number;
      }>(notaId, { cuenta_id: cuentaId, monto: montoEnviar, forma_pago: forma });
      setResultado({
        aplicado: Number(data.monto_aplicado ?? montoEnviar),
        vuelto,
        restante: Number(data.saldo_pendiente_restante ?? restante),
        forma,
      });
      onPagado?.(Number(data.monto_aplicado ?? montoEnviar));
    } catch (e) {
      setError(
        e instanceof ErrorPago && e.message ? e.message : 'No se pudo registrar el cobro.'
      );
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  const agregarDigitos = (d: string) => {
    setMonto(m => (m === '0' ? d : `${m}${d}`).slice(0, 9));
    montoRef.current?.focus();
  };

  // Teclado: Enter confirma; 1-4 eligen forma SOLO fuera del campo monto
  // (con foco en monto los dígitos son monto). En éxito, Enter = Nueva venta.
  const teclasRef = useRef({ resultado, confirmar, onNuevaVenta, onOpenChange });
  teclasRef.current = { resultado, confirmar, onNuevaVenta, onOpenChange };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const t = e.target as HTMLElement | null;
      const enCampo = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
      const s = teclasRef.current;
      if (s.resultado) {
        if (e.key === 'Enter') { e.preventDefault(); s.onNuevaVenta(); s.onOpenChange(false); }
        else if (e.key === 'Escape') { e.preventDefault(); s.onOpenChange(false); }
        return;
      }
      if (e.key === 'Enter') { e.preventDefault(); void s.confirmar(); return; }
      if (e.key === 'Escape') { e.preventDefault(); s.onOpenChange(false); return; }
      if (enCampo) return;
      const f = FORMAS.find(x => x.tecla === e.key);
      if (f) { e.preventDefault(); setForma(f.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const usarPredeterminada = (on: boolean) => {
    setPredeterminada(on ? cuentaId : 0);
    try {
      if (on) localStorage.setItem(claveCuenta, String(cuentaId));
      else localStorage.removeItem(claveCuenta);
    } catch { /* sin storage */ }
  };

  const salir = (accion: 'pdf' | 'whatsapp') => {
    if (notaId) router.push(`/notas-venta/${notaId}?accion=${accion}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto"
        data-testid="pos-cobrar"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">
            {resultado ? 'Cobro registrado' : 'COBRAR'}
          </DialogTitle>
        </DialogHeader>

        {resultado ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-card border border-[var(--border)] p-4 text-center">
              <p className="text-sm text-[var(--body-subtle)]">Cobrado</p>
              <p className="text-4xl font-black text-[var(--heading)]" data-testid="pos-cobro-aplicado">
                {formatCLP(resultado.aplicado)}
              </p>
              <p className="mt-1 text-sm text-[var(--body-subtle)]">Forma: {resultado.forma.toUpperCase()}</p>
              {resultado.vuelto > 0 && (
                <p className="mt-3 text-2xl font-black text-[var(--heading)]" data-testid="pos-vuelto">
                  Vuelto {formatCLP(resultado.vuelto)}
                </p>
              )}
              {resultado.restante > 0 && (
                <p className="mt-3 text-xl font-bold text-[var(--destructive)]" data-testid="pos-queda-debiendo">
                  Queda debiendo {formatCLP(resultado.restante)}
                </p>
              )}
            </div>
            {/* PDF/WhatsApp en 2 columnas; Nueva venta a ancho completo debajo. */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-14 min-w-0 px-2 text-sm font-bold whitespace-nowrap"
                onClick={() => salir('pdf')}
              >
                <Printer className="w-5 h-5 mr-1 shrink-0" /> Imprimir PDF
              </Button>
              <Button
                variant="outline"
                className="h-14 min-w-0 px-2 text-sm font-bold whitespace-nowrap"
                onClick={() => salir('whatsapp')}
              >
                <MessageCircle className="w-5 h-5 mr-1 shrink-0" /> WhatsApp
              </Button>
              <Button
                variant="brand"
                className="col-span-2 h-14 text-base font-black"
                autoFocus
                onClick={() => { onNuevaVenta(); onOpenChange(false); }}
              >
                <Plus className="w-5 h-5 mr-1" /> Nueva venta
              </Button>
            </div>
            <p className="text-xs text-center text-[var(--body-subtle)]">Enter = Nueva venta</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--body-subtle)]">Saldo pendiente</p>
              <p className="text-2xl font-extrabold text-[var(--heading)]">{formatCLP(saldo)}</p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[var(--body)]">Monto recibido (CLP)</label>
              <input
                ref={montoRef}
                type="text"
                inputMode="numeric"
                value={monto}
                onChange={e => setMonto(e.target.value.replace(/\D/g, '').slice(0, 9))}
                onFocus={e => e.target.select()}
                data-testid="pos-monto"
                className="h-16 w-full rounded-pill border border-[var(--border)] bg-[var(--card)] px-5 text-3xl font-black text-right focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {FORMAS.map(f => (
                <Button
                  key={f.id}
                  variant={forma === f.id ? 'brand' : 'outline'}
                  className="h-14 flex-col gap-0 text-xs font-black"
                  data-testid={`pos-forma-${f.id}`}
                  aria-pressed={forma === f.id}
                  onClick={() => setForma(f.id)}
                >
                  <span className="text-[10px] opacity-70">{f.tecla}</span>
                  {f.label}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0'].map(d => (
                <Button key={d} variant="outline" className="h-12 text-lg font-bold" onClick={() => agregarDigitos(d)}>
                  {d}
                </Button>
              ))}
              <Button
                variant="outline"
                className="h-12"
                aria-label="Borrar último dígito"
                onClick={() => setMonto(m => m.slice(0, -1))}
              >
                <Delete className="w-5 h-5" />
              </Button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <Button variant="secondary" className="h-12 text-xs font-bold" onClick={() => setMonto(String(saldo))}>
                Exacto
              </Button>
              {[5000, 10000, 20000].map(v => (
                <Button key={v} variant="secondary" className="h-12 text-xs font-bold" onClick={() => setMonto(String(v))}>
                  ${v.toLocaleString('es-CL')}
                </Button>
              ))}
            </div>

            {vuelto > 0 && (
              <p className="text-center text-3xl font-black text-[var(--heading)]" data-testid="pos-vuelto">
                Vuelto {formatCLP(vuelto)}
              </p>
            )}
            {montoNum > 0 && montoNum < saldo && (
              <p className="text-center text-lg font-bold text-[var(--destructive)]" data-testid="pos-queda-debiendo">
                Queda debiendo {formatCLP(saldo - montoNum)}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--body)]">Cuenta de caja</label>
              <select
                className="h-12 rounded-pill border border-[var(--border)] bg-[var(--card)] px-4 text-base"
                value={cuentaId}
                onChange={e => setCuentaId(Number(e.target.value))}
                data-testid="pos-cuenta"
                disabled={cuentas.length === 0}
              >
                {cuentas.length === 0 ? (
                  <option value={0}>No hay cuentas disponibles</option>
                ) : (
                  cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)
                )}
              </select>
              <label className="flex items-center gap-2 text-sm text-[var(--body)]">
                <input
                  type="checkbox"
                  checked={predeterminada === cuentaId && cuentaId !== 0}
                  onChange={e => usarPredeterminada(e.target.checked)}
                />
                Usar como predeterminada
              </label>
            </div>

            {error && <p className="text-sm font-bold text-[var(--destructive)]" role="alert">{error}</p>}

            {/* Footer sticky: CONFIRMAR siempre visible aunque el body scrollee. */}
            <div className="sticky bottom-0 flex flex-col gap-2 bg-popover pt-2">
              <Button
                variant="brand"
                className="h-16 text-2xl font-black"
                disabled={loading || cuentas.length === 0}
                onClick={confirmar}
                data-testid="pos-confirmar"
              >
                {loading ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : <CreditCard className="w-6 h-6 mr-2" />}
                CONFIRMAR
              </Button>
              <p className="text-xs text-center text-[var(--body-subtle)]">
                Enter confirma · 1-4 forma de pago · Esc cierra
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
