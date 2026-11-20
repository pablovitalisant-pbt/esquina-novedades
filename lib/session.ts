import type { Session } from 'next-auth';

/** Campos de `session.user` que usan las rutas API (todos opcionales: la sesión puede no tenerlos). */
export type UsuarioSesion = Partial<Pick<Session['user'], 'id' | 'nombre' | 'rol'>>;

/** `session.user` o `{}` — evita repetir el mismo acceso defensivo en cada ruta. */
export function usuarioSesion(session: Session | null): UsuarioSesion {
  return session?.user ?? {};
}

/**
 * Id de `usuarios` de la sesión, o `null`. `usuarios.id` es entero positivo:
 * solo pasan un number entero (> 0) o un string de solo dígitos. Un id no
 * numérico nunca debe llegar al FK (antes alguna ruta enviaba `NaN`).
 */
export function usuarioIdSesion(session: Session | null): number | null {
  const id = session?.user?.id;
  if (typeof id === 'number') return Number.isInteger(id) && id > 0 ? id : null;
  if (typeof id === 'string' && /^\d+$/.test(id)) return Number(id);
  return null;
}
