'use client';

import { useCallback, useEffect, useState } from 'react';

export type OpcionesBusquedaClientes = {
  /** Solo consulta cuando es true (p. ej. el diálogo está abierto). Default true. */
  activo?: boolean;
  /** Recorta la query antes de mandarla a la API. Default false. */
  trim?: boolean;
};

const MIN_CARACTERES = 2;
const DEBOUNCE_MS = 200;

/**
 * Búsqueda de clientes con debounce + AbortController.
 * Contrato y diferencias entre consumidores: PRD.md §"Refactors A16-A18".
 */
export function useBusquedaClientes<T = { id: number | string; nombre: string }>(
  query: string,
  { activo = true, trim = false }: OpcionesBusquedaClientes = {}
): { resultados: T[]; cargando: boolean; limpiar: () => void } {
  const [resultados, setResultados] = useState<T[]>([]);
  const [cargando, setCargando] = useState(false);
  const limpiar = useCallback(() => setResultados([]), []);

  useEffect(() => {
    if (!activo) return;
    const q = trim ? query.trim() : query;
    if (q.trim().length < MIN_CARACTERES) {
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
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, activo, trim]);

  return { resultados, cargando, limpiar };
}
