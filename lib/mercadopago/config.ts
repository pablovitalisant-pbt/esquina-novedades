/** Slice 9b — config MP. El token nunca se loguea ni va en mensajes de error. */
import MercadoPagoConfig from 'mercadopago';
export const TOLERANCIA_SEGUNDOS = 300;

export function mpAccessToken(): string {
  const token = process.env.MP_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('MP_ACCESS_TOKEN no está configurado');
  return token;
}

export function mpConfig(): MercadoPagoConfig {
  return new MercadoPagoConfig({ accessToken: mpAccessToken(), options: { timeout: 10_000 } });
}

/** URL pública del sitio, sin barra final. */
export function siteUrl(): string {
  const url = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '');
  if (!url) throw new Error('NEXT_PUBLIC_SITE_URL no está configurado');
  try { new URL(url); } catch { throw new Error('NEXT_PUBLIC_SITE_URL no es una URL absoluta válida'); }
  return url;
}

// ponytail: TEST- => sandbox; supuesto a validar con credenciales reales.

export function elegirInitPoint(
  preferencia: { init_point?: string; sandbox_init_point?: string },
  accessToken: string = mpAccessToken(),
): string {
  const point = accessToken.startsWith('TEST-')
    ? preferencia.sandbox_init_point
    : preferencia.init_point;
  if (!point) throw new Error('Mercado Pago no devolvió init_point para la preferencia');
  return point;
}
