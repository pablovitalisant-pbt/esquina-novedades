import type { Session } from 'next-auth';
import flags from '@/config/feature-flags.json';

/** N12b — quién puede ver el registro privado de pagos. */
export type RolPagosApp = 'pablo' | 'paola';

const INT4_MAX = 2_147_483_647;

/** ID de usuario como entero positivo canónico, o null si no sirve. */
function idValido(valor: string | undefined): number | null {
  const texto = valor?.trim() ?? '';
  if (!/^[1-9]\d*$/.test(texto)) return null;
  const id = Number(texto);
  return id <= INT4_MAX ? id : null;
}

/**
 * - Flag pagos-app-privados encendido.
 * - Sesión admin.
 * - IDs Pablo y Paola configurados en servidor, positivos y distintos.
 * Devuelve null ante cualquier config incompleta o inválida.
 * La lista de IDs nunca sale de este módulo.
 */
export function rolPagosApp(session: Session | null): RolPagosApp | null {
  // ponytail: Record porque la clave aún no existe en feature-flags.json.
  if ((flags as Record<string, boolean>)['pagos-app-privados'] !== true) return null;

  const usuario = session?.user;
  if (!usuario?.id || usuario.rol !== 'admin') return null;

  const pablo = idValido(process.env.PAGOS_APP_PABLO_ID);
  const paola = idValido(process.env.PAGOS_APP_PAOLA_ID);
  if (pablo === null || paola === null || pablo === paola) return null;

  const id = idValido(usuario.id);
  if (id === pablo) return 'pablo';
  if (id === paola) return 'paola';
  return null;
}
