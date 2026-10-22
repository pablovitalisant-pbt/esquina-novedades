# Bugfix — login/precache roto en `npm run start` + incógnito (Task #12)

Protocolo PBT-IA-DEBUGGING. Diagnóstico ya hecho por Director Técnico
(Claude chat), evidencia verificada contra código real y documentación
oficial de Next.js. No es un slice offline, es un bugfix puntual.

## CLASIFICAR

Tipo G (regresión de configuración) — no es visual, no es de datos,
no es intermitente. Reproducible 100% en el escenario descrito.

## REPRODUCIR

1. `npm run build && npm run start`
2. Abrir `http://localhost:3000/login` en ventana de incógnito.
3. Iniciar sesión con credenciales válidas.
4. Resultado actual: el login "no entra" — vuelve a `/login` (o se
   queda en un estado inconsistente) en vez de navegar a `/precios`.

## EVIDENCIA

`lib/auth.ts` líneas 79-90:
```ts
cookies: {
  sessionToken: {
    name: process.env.NODE_ENV === 'production'
      ? `__Secure-next-auth.session-token`
      : `next-auth.session-token`,
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    },
  },
},
```
`npm run start` fuerza `NODE_ENV=production` (comportamiento propio de
Next.js — confirmado contra la documentación oficial, no configurable).
Con eso, NextAuth intenta setear la cookie de sesión con `secure: true`
y el prefijo `__Secure-`. Un navegador rechaza esa cookie sobre una
conexión no-HTTPS (`http://localhost:3000`). El POST a
`authorize()` en `lib/auth.ts` valida bien las credenciales, pero la
cookie de sesión nunca se guarda en el navegador. `middleware.ts` línea
27 (`authorized: ({ token }) => !!token`) no encuentra token y redirige
de vuelta a `/login`.

Serwist descartado como causa: `app/sw.ts` tiene `NetworkOnly` explícito
para `/api/**` antes de cualquier regla de caché, no interfiere con
las llamadas de NextAuth.

Incógnito no es la causa, solo hace el síntoma más visible (sin cookies
previas que lo disimulen) — pasaría igual en ventana normal sobre HTTP.
En producción (Vercel, HTTPS real) esto nunca fue un problema — por eso
no se había notado hasta ahora.

## HIPÓTESIS

Causa: la cookie se condiciona por `NODE_ENV` en vez de por si la
conexión es realmente HTTPS. `NEXTAUTH_URL` ya existe como env var
(`.env.example`: `http://localhost:3000` en dev; en Vercel producción
es `https://bazarnaty.vercel.app`) y es la señal correcta a usar.

Archivo afectado: solo `lib/auth.ts`. Criterio de éxito: con
`npm run start` sobre `http://localhost:3000`, el login persiste la
cookie de sesión y navega correctamente; en producción (Vercel, HTTPS)
el comportamiento no cambia (sigue usando `__Secure-` + `secure: true`).

## FIX MÍNIMO (≤ 50 líneas, un solo archivo)

`lib/auth.ts`, reemplazar las líneas 81 y 88:
```ts
// antes
name: process.env.NODE_ENV === 'production' ? `__Secure-next-auth.session-token` : `next-auth.session-token`,
...
secure: process.env.NODE_ENV === 'production',

// después
name: process.env.NEXTAUTH_URL?.startsWith('https://') ? `__Secure-next-auth.session-token` : `next-auth.session-token`,
...
secure: process.env.NEXTAUTH_URL?.startsWith('https://') ?? false,
```
Entregar en DIFF unificado. No tocar ningún otro archivo.

## VERIFICAR

1. `npm run build && npm run start`, incógnito, login sobre
   `http://localhost:3000` → cookie de sesión se guarda (DevTools →
   Application → Cookies → `next-auth.session-token` presente),
   navega a `/precios` sin rebote a `/login`.
2. Confirmar que con `NEXTAUTH_URL` simulado como `https://...` (test
   unitario o verificación de la expresión) el resultado sigue siendo
   `__Secure-next-auth.session-token` + `secure: true` — no se rompe
   el comportamiento de producción.
3. `npm run build` limpio, suite sin regresiones.

## REGISTRAR

Agregar entrada en `BUGS.md` con la causa raíz (cookie `secure`/
`__Secure-` condicionada por `NODE_ENV` en vez de por HTTPS real) y el
commit del fix. No hacer commit sin mi aprobación — mostrame el DIFF
primero.
