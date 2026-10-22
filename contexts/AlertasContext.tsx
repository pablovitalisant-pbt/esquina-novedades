'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

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

  const refreshStockBajo = useCallback(async () => {
    try {
      const res = await fetch('/api/alertas-stock');
      if (res.ok) {
        const data = await res.json();
        setStockBajoCount(data.count || 0);
      }
    } catch {}
  }, []);

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
