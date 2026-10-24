import type { Session } from 'next-auth';

/** Campos de `session.user` que usan las rutas API (todos opcionales: la sesión puede no tenerlos). */
export type UsuarioSesion = Partial<Pick<Session['user'], 'id' | 'nombre' | 'rol'>>;

/** `session.user` o `{}` — evita repetir el mismo acceso defensivo en cada ruta. */
export function usuarioSesion(session: Session | null): UsuarioSesion {
  return session?.user ?? {};
}
