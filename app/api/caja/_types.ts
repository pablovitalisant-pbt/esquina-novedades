// Forma de session.user que arma lib/auth.ts. NextAuth no la declara, así que
// el cast queda acotado aquí en vez de repetir `as any` en cada route.
export type SessionUser = { id: string; nombre: string; rol: string };
