'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePowerSync } from '@powersync/react';
import flags from '@/config/feature-flags.json';

interface AlertasContextType {
  stockBajoCount: number;
  refreshStockBajo: () => Promise<void>;
}

const AlertasContext = createContext<AlertasContextType>({
  stockBajoCount: 0,
  refreshStockBajo: async () => {},
});

export function AlertasProvider({ children }: { children: React.ReactNode }) {
  const [stockBajoCount, setStockBajoCount] = useState(0);
  // usePowerSync() devuelve null sin provider (flag off) → branch offline inactivo.
  const OFFLINE_READ = (flags as any)["alertas-badge-offline"];
  const db = usePowerSync();

  const refreshStockBajo = useCallback(async () => {
    if (OFFLINE_READ && db) {
      // Conteo local (flag on): replica GET /api/alertas-stock. Sin empresa_id
      // (single-tenant), mismo criterio que la API.
      try {
        const rows = (await db.getAll(
          `SELECT COUNT(*) as count FROM productos p
           LEFT JOIN ubicaciones_bodega ub ON ub.codigo = p.codigo
           WHERE p.stock_minimo IS NOT NULL
             AND COALESCE(ub.saldo, p.saldo, 0) < p.stock_minimo
             AND p.no_reponer = 0
             AND NOT EXISTS (SELECT 1 FROM alertas_stock_bajo a WHERE a.producto_id = p.id)`
        )) as any[];
        setStockBajoCount(Number((rows?.[0] as any)?.count) || 0);
      } catch {}
      return;
    }
    try {
      const res = await fetch('/api/alertas-stock');
      if (res.ok) {
        const data = await res.json();
        setStockBajoCount(data.count || 0);
      }
    } catch {}
  }, [OFFLINE_READ, db]);

  useEffect(() => {
    refreshStockBajo();
  }, [refreshStockBajo]);

  return (
    <AlertasContext.Provider value={{ stockBajoCount, refreshStockBajo }}>
      {children}
    </AlertasContext.Provider>
  );
}

export function useAlertas() {
  return useContext(AlertasContext);
}
