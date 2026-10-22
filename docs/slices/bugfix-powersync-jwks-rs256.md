# Migración Client Auth PowerSync: HS256 → JWKS asimétrico (Task #47)

No es un slice offline, es un cambio puntual de un archivo. Contexto:
la doc de PowerSync recomienda JWKS asimétrico para producción (HS256
es solo para dev/testing). Ya generamos el par de llaves (RS256) y
Pablo ya:
1. Pegó `POWERSYNC_JWT_PRIVATE_KEY` (PKCS8 en base64, una sola línea)
   en `.env.local` y en Vercel (Sensitive).
2. Pegó el JWKS de la llave pública en PowerSync Dashboard → instancia
   Development → Client Auth → JWKS, con `kid: 'bazar-naty-rs256-v1'`.

## Cambio requerido

Archivo único: `app/api/powersync/token/route.ts`.

Reemplazar la firma HS256 actual:
```ts
const secret = process.env.POWERSYNC_JWT_SECRET;
...
const token = await new SignJWT({ rol: user.rol })
  .setProtectedHeader({ alg: 'HS256', kid: 'bazar-naty-hs256-v1' })
  .setSubject(String(user.id))
  .setAudience(endpoint)
  .setIssuedAt()
  .setExpirationTime('30m')
  .sign(Buffer.from(secret, 'base64url'));
```

Por firma RS256 usando la llave privada (PKCS8, base64, una línea) de
`POWERSYNC_JWT_PRIVATE_KEY`:
```ts
import { SignJWT, importPKCS8 } from 'jose';

// ...

const privateKeyBase64 = process.env.POWERSYNC_JWT_PRIVATE_KEY;
const endpoint = process.env.POWERSYNC_INSTANCE_URL;
if (!privateKeyBase64 || !endpoint) {
  return NextResponse.json(
    { error: 'Configuración de PowerSync incompleta' },
    { status: 500 }
  );
}

const privateKeyPem = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
const privateKey = await importPKCS8(privateKeyPem, 'RS256');

const user = session.user as any;
const token = await new SignJWT({ rol: user.rol })
  .setProtectedHeader({ alg: 'RS256', kid: 'bazar-naty-rs256-v1' })
  .setSubject(String(user.id))
  .setAudience(endpoint)
  .setIssuedAt()
  .setExpirationTime('30m')
  .sign(privateKey);
```

Notas:
- `kid` debe ser exactamente `bazar-naty-rs256-v1` — tiene que
  coincidir con el que está en el JWKS pegado en el Dashboard.
- No tocar `POWERSYNC_INSTANCE_URL` ni el resto del archivo.
- `POWERSYNC_JWT_SECRET` (env var vieja de HS256) queda sin usar en el
  código pero no hace falta borrarla de `.env.local`/Vercel en este
  cambio — es limpieza aparte, sin urgencia.

## Verificar

1. `npm run build` limpio.
2. Local: `npm run dev`, login, confirmar que la app conecta a
   PowerSync sin error 401/403 en la consola (Network tab →
   `/api/powersync/token` debe devolver 200 con un `token` que
   empieza con `eyJhbGciOiJSUzI1NiIs...` — RS256 en vez de HS256 en el
   header del JWT).
3. Si hay tests que mockean `POWERSYNC_JWT_SECRET`/HS256 para este
   endpoint, actualizarlos a la nueva variable/algoritmo.
4. DIFF antes de commit — no hacer commit sin aprobación.

## Registrar

Al cerrar, recordame borrar `scripts/tmp-generate-jwks.mjs` del repo
(no está commiteado, es de un solo uso) y marcar la Task #47 como
completada.
