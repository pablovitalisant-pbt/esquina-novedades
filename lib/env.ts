import flags from '@/config/feature-flags.json';

export const REQUERIDAS = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'NEXT_PUBLIC_SITE_URL',
  'CRON_SECRET',
] as const;

export const REQUERIDAS_PAGO = ['MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET'] as const;

export const OPCIONALES = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME',
] as const;

export type Entorno = Record<string, string | undefined>;
export type ResultadoEntorno = {
  faltantes: string[];
  opcionalesFaltantes: string[];
};
export type LogEntorno = Pick<Console, 'error' | 'warn'>;

const falta = (env: Entorno, nombre: string) => !env[nombre] || env[nombre]!.trim() === '';

export function revisarEntorno(env: Entorno, pagoOnline: boolean): ResultadoEntorno {
  const requeridas: readonly string[] = pagoOnline
    ? [...REQUERIDAS, ...REQUERIDAS_PAGO]
    : [...REQUERIDAS];

  return {
    faltantes: requeridas.filter((nombre) => falta(env, nombre)),
    opcionalesFaltantes: OPCIONALES.filter((nombre) => falta(env, nombre)),
  };
}

export function validarEntorno(env: Entorno = process.env, log: LogEntorno = console): ResultadoEntorno {
  const pagoOnline = Boolean((flags as Record<string, unknown>)['tienda-pago-online']);
  const resultado = revisarEntorno(env, pagoOnline);

  if (resultado.faltantes.length) {
    log.error(`[env] Faltan variables requeridas: ${resultado.faltantes.join(', ')}`);
  }
  if (resultado.opcionalesFaltantes.length) {
    log.warn(`[env] Variables opcionales sin definir: ${resultado.opcionalesFaltantes.join(', ')}`);
  }

  return resultado;
}
