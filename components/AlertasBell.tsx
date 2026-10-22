'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, AlertTriangle } from 'lucide-react';
import { usePowerSync } from '@powersync/react';
import { useAlertas } from '@/contexts/AlertasContext';
import { Badge } from './ui/badge';
import flags from '@/config/feature-flags.json';

interface StockBajoItem {
  producto_id: number;
  codigo: string;
  detalle: string;
  saldo: number;
  stock_minimo: number;
  cantcaja: number;
  deficit: number;
}

export function AlertasBell() {
  const { stockBajoCount } = useAlertas();
  const router = useRouter();
  // usePowerSync() devuelve null sin provider (flag off) → branch offline inactivo.
  const OFFLINE_READ = (flags as any)["alertas-badge-offline"];
  const db = usePowerSync();
  const [open, setOpen] = useState(false);
  const [lista, setLista] = useState<StockBajoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Click outside → close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Abort in-flight fetch on unmount
  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const toggle = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (fetchingRef.current) return;

    fetchingRef.current = true;
    setLoading(true);

    if (OFFLINE_READ && db) {
      // Lista local (flag on): replica GET /api/alertas-stock/lista. Sin
      // empresa_id (single-tenant). p.cantcaja incluido porque el dropdown
      // calcula cajas. producto_id local (SERIAL string) → number.
      db.getAll(
        `SELECT p.id AS producto_id, p.codigo, p.detalle,
           COALESCE(ub.saldo, p.saldo, 0) AS saldo, p.stock_minimo, p.cantcaja,
           (p.stock_minimo - COALESCE(ub.saldo, p.saldo, 0)) AS deficit
         FROM productos p
         LEFT JOIN ubicaciones_bodega ub ON ub.codigo = p.codigo
         WHERE p.stock_minimo IS NOT NULL
           AND COALESCE(ub.saldo, p.saldo, 0) < p.stock_minimo
           AND p.no_reponer = 0
           AND NOT EXISTS (SELECT 1 FROM alertas_stock_bajo a WHERE a.producto_id = p.id)
         ORDER BY deficit DESC`
      )
        .then((rows: any[]) => {
          setLista((rows || []).map((r) => ({ ...r, producto_id: Number(r.producto_id) })));
        })
        .catch(() => {})
        .finally(() => {
          setLoading(false);
          fetchingRef.current = false;
        });
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    fetch('/api/alertas-stock/lista', { signal: controller.signal })
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(d => {
        if (!controller.signal.aborted) setLista(d.data || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          fetchingRef.current = false;
        }
      });
  }, [open, db, OFFLINE_READ]);

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={toggle}
        className="relative p-2 text-[var(--body)] hover:text-[var(--primary)] transition-colors"
        aria-label="Alertas de stock"
        data-testid="alertas-bell"
      >
        <Bell className="w-5 h-5" />
        {stockBajoCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 text-[10px] px-1.5 py-0 min-w-[18px] h-[18px] flex items-center justify-center"
          >
            {stockBajoCount}
          </Badge>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg z-50 p-3">
          <div className="flex items-center gap-2 pb-2 mb-2 border-b border-[var(--border)]">
            <AlertTriangle className="w-4 h-4 text-[var(--destructive)]" />
            <h3 className="text-sm font-semibold text-[var(--heading)]">Stock bajo o agotado</h3>
          </div>
          {loading && lista.length === 0 && (
            <p className="text-sm text-[var(--body)] text-center py-4">Cargando...</p>
          )}
          {!loading && lista.length === 0 && (
            <p className="text-sm text-[var(--body)] text-center py-4">Sin alertas</p>
          )}
          {lista.length > 0 && (
            <div className="space-y-1">
              {lista.map(p => (
                <div
                  key={p.producto_id}
                  onClick={() => { router.push('/alertas-stock'); setOpen(false); }}
                  className="flex items-center justify-between gap-3 py-2 px-1 border-b border-[var(--border)] last:border-0 cursor-pointer rounded-lg hover:bg-[var(--muted)] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--body)]">{p.codigo}</p>
                    <p className="text-xs text-[var(--body)] truncate">{p.detalle}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-semibold text-[var(--destructive)]">{p.saldo}</span>
                    <span className="text-xs text-[var(--body)]">/{p.stock_minimo}</span>
                    <div className="text-[10px] text-[var(--body-subtle)] leading-none mt-0.5">
                      {Math.floor(p.saldo / p.cantcaja)} cj{p.saldo % p.cantcaja > 0 ? ` + ${p.saldo % p.cantcaja}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => {
              router.push('/alertas-stock');
              setOpen(false);
            }}
            className="w-full mt-2 text-center text-sm font-medium text-[var(--primary)] hover:underline py-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
          >
            Ver todas
          </button>
        </div>
      )}
    </div>
  );
}
