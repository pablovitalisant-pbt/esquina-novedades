/** Llamadas HTTP compartidas para armar notas de venta (A18). */

import { ErrorApi } from './api-error';

/** Error HTTP con el mensaje que devolvio el servidor ('' si no traia uno). */
export class ErrorNota extends ErrorApi {
  constructor(message: string) {
    super(message, 'ErrorNota');
  }
}

/** Mensaje de `{ error }` del body de una respuesta no-ok ('' si no viene). */
async function mensajeErrorRespuesta(res: { json(): Promise<unknown> }): Promise<string> {
  const err = (await res.json()) as { error?: unknown } | null;
  return typeof err?.error === 'string' ? err.error : '';
}

/**
 * POST /api/notas-venta. Crea la nota (con cliente o sin el) y devuelve su id
 * como string. Un HTTP no-ok se rechaza con el mensaje del servidor cuando el
 * body lo trae (body no parseable = mensaje vacio); una respuesta sin id
 * valido nunca se convierte en "undefined"/"null".
 */
export async function crearNota(clienteId?: number | string | null): Promise<string> {
  const res = await fetch('/api/notas-venta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clienteId ? { cliente_id: clienteId } : {}),
  });
  if (!res.ok) {
    // Igual que agregarItem: mostrar el mensaje real de la API cuando exista;
    // el llamador usa su generico si el body no trae uno legible.
    let mensaje = '';
    try {
      mensaje = await mensajeErrorRespuesta(res);
    } catch {
      // body no parseable
    }
    throw new ErrorNota(mensaje);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ErrorNota('');
  }
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) return String(id);
  if (typeof id === 'string') {
    const limpio = id.trim();
    if (limpio !== '' && limpio !== 'undefined' && limpio !== 'null') return limpio;
  }
  throw new ErrorNota('');
}

/**
 * POST /api/notas-venta/[id]/items. El payload se envia intacto (mismo orden
 * de claves que el llamador). En !ok lanza ErrorNota con el mensaje del
 * servidor; un body de error no parseable propaga el error de parseo.
 */
export async function agregarItem<T = { id: string }>(
  notaId: string | number,
  payload: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`/api/notas-venta/${notaId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    // Un body no parseable propaga el error de parseo (igual que antes).
    throw new ErrorNota(await mensajeErrorRespuesta(res));
  }
  return (await res.json()) as T;
}
