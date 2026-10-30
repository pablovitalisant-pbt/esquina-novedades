import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { RUTAS_POR_ROL } from '@/lib/rutas-por-rol';
import { rutaInicio } from '@/lib/ruta-inicio';
import flags from '@/config/feature-flags.json';
import type { JWT } from 'next-auth/jwt';

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token as JWT | null;
    const rol = token?.rol;

    if (!rol || !RUTAS_POR_ROL[rol]) {
      return NextResponse.redirect(new URL('/login', req.url));
    }

    const rutasPermitidas = RUTAS_POR_ROL[rol];
    const tieneAcceso = rutasPermitidas.some(ruta => pathname.startsWith(ruta));

    if (!tieneAcceso) {
      // Inicio por rol (pos4): con pos-v1 manda /pos, si no la primera ruta.
      const inicio = rutaInicio(rol, flags as Record<string, boolean>);
      const destino = rutasPermitidas.includes(inicio) ? inicio : rutasPermitidas[0];
      return NextResponse.redirect(new URL(destino, req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    '/((?!api/|login|catalogo|productos|pedido/|_next/static|_next/image|favicon\.ico|.*\.(?:png|jpg|jpeg|svg|gif|webp|ico|json|webmanifest)$).+)',
  ],
};
