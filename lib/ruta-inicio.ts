/**
 * pos4 — ruta de inicio según rol y flags. Puro: la usan login (cliente),
 * "/" y middleware (edge); nunca importar aquí nada de servidor.
 */
export function rutaInicio(
  rol: string | null | undefined,
  flags: Record<string, boolean>
): string {
  if (flags['pos-v1'] !== true) return '/precios';
  if (rol === 'admin' || rol === 'vendedor') return '/pos';
  if (rol === 'bodeguero') return '/bodega';
  return '/precios';
}

/**
 * callbackUrl de login: solo rutas internas ("/..."). Rechaza URLs externas,
 * protocol-relative ("//evil.com") y "/\evil.com" (open redirect).
 */
export function rutaCallbackSegura(callbackUrl: string | null | undefined): string | null {
  if (!callbackUrl || !callbackUrl.startsWith('/')) return null;
  if (callbackUrl.startsWith('//') || callbackUrl.startsWith('/\\')) return null;
  return callbackUrl;
}
