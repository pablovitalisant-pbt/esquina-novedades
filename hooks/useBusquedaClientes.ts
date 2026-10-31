'use client';

import { useCallback, useEffect, useState } from 'react';

export type OpcionesBusquedaClientes = {
  /** Solo consulta cuando es true (p. ej. el diálogo está abierto). Default true. */
  activo?: boolean;
  /** Recorta la query antes de mandarla a la API. Default false. */
  trim?: boolean;
  minCaracteres?: number;
  debounceMs?: number;
};

/**
 * Búsqueda de clientes con debounce + AbortController.
 * Contrato y diferencias entre consumidores: PRD.md §"Refactors A16-A18".
 */
export function useBusquedaClientes<T = { id: number | string; nombre: string }>(
  query: string,
  { activo = true, trim = false, minCaracteres = 2, debounceMs = 200 }: OpcionesBusquedaClientes = {}
): { resultados: T[]; cargando: boolean; limpiar: () => void } {
  const [resultados, setResultados] = useState<T[]>([]);
  const [cargando, setCargando] = useState(false);
  const limpiar = useCallback(() => setResultados([]), []);

  useEffect(() => {
    if (!activo) return;
    const q = trim ? query.trim() : query;
    if (q.trim().length < minCaracteres) {
      setResultados([]);
      setCargando(false);
      return;
    }
    const controller = new AbortController();
    setCargando(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (res.ok) {
          const { data } = await res.json();
          setResultados((data ?? []) as T[]);
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === 'AbortError')) setResultados([]);
      } finally {
        setCargando(false);
      }
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, activo, trim, minCaracteres, debounceMs]);

  return { resultados, cargando, limpiar };
}
