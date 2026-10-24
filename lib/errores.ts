/** Helpers de error compartidos por las rutas API. */

export function mensajeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Código de error de Postgres (p. ej. '23505'), o '' si no aplica. */
export function codigoError(e: unknown): string {
  return e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : '';
}
