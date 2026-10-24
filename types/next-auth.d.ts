import type { DefaultSession } from 'next-auth';

// Forma que lib/auth.ts arma en el token y expone en session.user.
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      rut: string;
      nombre: string;
      rol: string;
      empresas: number[];
    } & DefaultSession['user'];
  }

  interface User {
    rut: string;
    nombre: string;
    rol: string;
    empresas: number[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    rut: string;
    nombre: string;
    rol: string;
    empresas: number[];
  }
}
