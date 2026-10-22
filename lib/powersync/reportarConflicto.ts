/**
 * Reporte de conflictos de sincronización a la bandeja (Slice 9b).
 *
 * Se llama desde `BackendConnector.uploadData()` cuando una operación se
 * descarta por un fallo permanente (400 de validación). Hace un POST a
 * `POST /api/sync-conflictos` (Slice 9a).
 *
 * Falla de forma SILENCIOSA: nunca relanza ni afecta `shouldComplete` ni el
 * flujo de la cola de sync. Si el reporte falla (red caída justo en ese
 * instante), la operación original ya fue determinada como inválida
 * permanentemente — no tiene sentido bloquear la cola por un fallo al
 * *reportar* algo que de todos modos se descarta. Solo `console.error`.
 */
export async function reportarConflicto(opts: {
  tabla: string;
  operacion: string;
  entidad_id: string;
  payload: Record<string, any>;
  http_status: number;
  error_mensaje: string | null;
}): Promise<void> {
  try {
    await fetch('/api/sync-conflictos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // el endpoint exige sesión (cualquier rol autenticado)
      body: JSON.stringify({
        tabla: opts.tabla,
        operacion: opts.operacion,
        entidad_id: opts.entidad_id,
        payload: opts.payload,
        http_status: opts.http_status,
        error_mensaje: opts.error_mensaje,
      }),
    });
  } catch (e) {
    console.error('reportarConflicto: fallo al reportar el conflicto', e);
  }
}

/**
 * Intenta extraer `body.error` de la respuesta. Si `.json()` falla
 * (respuesta no-JSON), devuelve `null` sin lanzar.
 */
export async function extraerMensajeError(res: Response): Promise<string | null> {
  try {
    const body = await res.json();
    return body?.error ?? null;
  } catch {
    return null;
  }
}
