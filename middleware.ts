import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { RUTAS_POR_ROL } from '@/lib/rutas-por-rol';
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
      const primeraRuta = rutasPermitidas[0];
      return NextResponse.redirect(new URL(primeraRuta, req.url));
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
