/** Llamadas HTTP compartidas para armar notas de venta (A18). */

/** Error HTTP con el mensaje que devolvio el servidor ('' si no traia uno). */
export class ErrorNota extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErrorNota';
  }
}

/**
 * POST /api/notas-venta. Crea la nota (con cliente o sin el) y devuelve su id
 * como string. Un HTTP no-ok se rechaza antes de parsear el body; una
 * respuesta sin id valido nunca se convierte en "undefined"/"null".
 */
export async function crearNota(clienteId?: number | string | null): Promise<string> {
  const res = await fetch('/api/notas-venta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clienteId ? { cliente_id: clienteId } : {}),
  });
  if (!res.ok) throw new ErrorNota('');
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
    const err = await res.json();
    throw new ErrorNota(typeof err.error === 'string' ? err.error : '');
  }
  return (await res.json()) as T;
}
