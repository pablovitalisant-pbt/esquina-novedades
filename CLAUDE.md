# CLAUDE.md — La Esquina de las Novedades

ERP + e-commerce para LA ESQUINA DE LAS NOVEDADES SPA (Iquique, Chile).
Copia de `bazar-naty` adaptada: CLP, venta mayorista (caja) y detalle (unidad)
sobre un solo inventario, tienda online con pago Mercado Pago Checkout Pro.
Todo el alcance y las reglas de negocio están en `PRD.md`.

## Stack

- Next.js 15.5 (App Router) + React 18 + TypeScript
- Neon Postgres (`@neondatabase/serverless`, cliente en `lib/db.ts`)
- NextAuth 4
- Tailwind CSS + shadcn/ui
- Cloudinary (imágenes de productos)
- Mercado Pago Checkout Pro (SDK npm `mercadopago`)
- Jest + Testing Library
- Deploy: Vercel

## Neon

| Dato | Valor |
|---|---|
| Organización | `org-lucky-math-65013365` |
| Proyecto | `steep-shape-55022986` |
| Branch | `production` |

Setup (PRD §10.2): `neon init -y --org-id org-lucky-math-65013365 --project-id steep-shape-55022986 --branch production --services postgres` y luego `neon deploy`.

Regla dura: no hay runner de migraciones. Toda migración DDL se aplica
explícitamente contra el proyecto/branch de arriba y se verifica contra la
base real antes de activar un flag que dependa de ella. Nunca editar una
migración ya aplicada: crear una nueva.

## Comandos

```
npm run dev      # desarrollo
npm run build    # build de producción
npm run start    # servir build
npm run lint     # eslint
npm run test     # jest
npx tsc --noEmit # typecheck
```

## Estructura de carpetas

```
app/
  (app)/          # rutas autenticadas: admin/, bodega/, caja-mayor/, clientes/,
                  # deudores/, notas-venta/, pedidos/, precios/, catalogo/admin/,
                  # alertas-stock/
  (auth)/login/
  api/            # rutas API (kebab-case)
  catalogo/[slug]/  # catálogo público
  productos/        # tienda pública + carrito
components/
contexts/
hooks/
lib/
migrations/       # SQL numerado, aplicado a mano
config/feature-flags.json
design-skill/     # skill de diseño UI (leer antes de escribir JSX)
docs/
  referencia-bazar-naty/  # PRD/BUGS/contexto del proyecto origen (solo lectura)
  slices/
```

## Naming conventions

- Componentes PascalCase (`ProductCard.tsx`), hooks `useX`.
- Rutas API kebab-case bajo `app/api/`.
- Migraciones `NNN_descripcion.sql`, siguiente número libre.
- Feature flags kebab-case en `config/feature-flags.json`, nuevos en `false`.
- Montos en CLP como enteros.

## Reglas específicas del proyecto

- Mayorista = caja completa (`modalidad='caja'`, descuenta `cantcaja` unidades).
  Detalle = `modalidad='unidad'`. Un solo `saldo` en unidades.
- Descuento de stock siempre atómico: `UPDATE ... SET saldo = saldo - x WHERE ... AND saldo >= x`.
- Pedido online reserva stock al crearse; expira a las 36 h (liberación
  perezosa + cron diario). Ver PRD §8.4.
- Webhook de Mercado Pago: validar `x-signature` (HMAC-SHA256) antes de
  todo, consultar el pago a la API, procesar de forma idempotente.
- Nunca loguear ni commitear `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` ni
  `DATABASE_URL`. Usar credenciales de prueba hasta el slice de deploy.
- `docs/referencia-bazar-naty/` es solo referencia: sus BUGS describen
  zonas frágiles del código heredado (Señal 1 aplica también a esos archivos).

## Diseño de UI

Antes de escribir JSX, leer `design-skill/SKILL.md` y los módulos que
apliquen (mínimo `layout.md`, `typography.md`, `colors.md`, `buttons.md`,
`cards.md`, `shadows.md`, `radius.md`, `borders.md`). Mapear los tokens a la
config de Tailwind/CSS antes de usarlos. Colores de marca: los de la clienta
(pendiente recibir).

## Referencia al PRD

`PRD.md` manda en alcance, reglas de negocio y orden de slices (§9). Revisar
§10 (riesgos) y "Zonas de riesgo conocidas" antes de cada Fase A.

## Debugging

Debugging: protocolo en ~/.claude/skills/pbt-ia-debugging.md
Se activa con: "hay un bug", "se rompio", "dejo de funcionar", "sigue pasando"
Registro: BUGS.md en la raiz del proyecto
