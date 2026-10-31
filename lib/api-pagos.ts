/** Llamadas HTTP compartidas por los dialogos de cobro (A17). */

import type { Cuenta } from '@/types';

/** Error HTTP con el mensaje que devolvio el servidor ('' si no traia uno). */
export class ErrorPago extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErrorPago';
  }
}

/**
 * GET /api/caja/cuentas?activas=true.
 * `soloSiOk` descarta el body de una respuesta no-ok (comportamiento del POS).
 */
export async function cargarCuentasActivas(
  { soloSiOk = false }: { soloSiOk?: boolean } = {}
): Promise<Cuenta[]> {
  const res = await fetch('/api/caja/cuentas?activas=true');
  if (soloSiOk && !res.ok) return [];
  const data = await res.json();
  return data.data ?? [];
}

/**
 * POST /api/notas-venta/[id]/pagar. El payload se envia intacto (mismo orden
 * de claves que el llamador). En !ok lanza ErrorPago con el mensaje del
 * servidor; el body de exito se parsea con fallback a {}.
 */
export async function pagarNota<T = Record<string, unknown>>(
  notaId: string | number,
  payload: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`/api/notas-venta/${notaId}/pagar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new ErrorPago(typeof err.error === 'string' ? err.error : '');
  }
  return (await res.json().catch(() => ({}))) as T;
}
