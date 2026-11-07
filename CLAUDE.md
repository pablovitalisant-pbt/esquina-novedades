> **Al retomar: lee `docs/BACKLOG-2026-11-07-MANTENIMIENTO.md`, `docs/BACKLOG-2026-11-06.md` y el último estado de `CONTEXT-CLAUDE-CHAT.md`. El traspaso del 28/10 es histórico.**

# CLAUDE.md — La Esquina de las Novedades

ERP + e-commerce para LA ESQUINA DE LAS NOVEDADES SPA (Iquique, Chile).
Copia de `bazar-naty` adaptada: CLP, venta mayorista y detalle por unidad
sobre un inventario; reserva antes de elegir Mercado Pago, transferencia o efectivo.
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

- Modalidades vigentes: `detalle` y `mayor`, siempre unidades. En notas el vendedor elige; en tienda el servidor aplica `minimo_mayor`. `cantcaja` es solo información de bodega. No reintroducir venta por caja.
- No hay cupo de cuatro usuarios: un administrador crea cuentas con RUT único según necesidad.
- Descuento de stock siempre atómico: `UPDATE ... SET saldo = saldo - x WHERE ... AND saldo >= x`.
- Pedido online reserva stock al crearse; expira a las 36 h (liberación
  perezosa + cron diario). Ver PRD §8.4.
- Webhook de Mercado Pago: validar `x-signature` (HMAC-SHA256) antes de
  todo, consultar el pago a la API, procesar de forma idempotente.
- Nunca loguear ni commitear `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` ni
  `DATABASE_URL`. Producción ya usa credenciales reales; tests y smokes deben usar TEST y proveedor simulado, nunca producir ventas o cobros ficticios en producción.
- `docs/referencia-bazar-naty/` es solo referencia: sus BUGS describen
  zonas frágiles del código heredado (Señal 1 aplica también a esos archivos).

## Diseño de UI

Antes de escribir JSX, leer `design-skill/SKILL.md` y los módulos que
apliquen (mínimo `layout.md`, `typography.md`, `colors.md`, `buttons.md`,
`cards.md`, `shadows.md`, `radius.md`, `borders.md`). Mapear los tokens a la
config de Tailwind/CSS antes de usarlos. Colores de marca: los de la clienta
(ya incorporados en `lib/empresa.ts` y `public/marca/`).

## Referencia al PRD

`PRD.md` manda en alcance, reglas de negocio y orden de slices (§9). Revisar
§10 (riesgos) y "Zonas de riesgo conocidas" antes de cada Fase A.

## Debugging

Debugging: protocolo en ~/.claude/PBT-IA-DEBUGGING.md
Se activa con: "hay un bug", "se rompio", "dejo de funcionar", "sigue pasando"
Registro: BUGS.md en la raiz del proyecto
