# Fase A — Slices 9 y 10: Mercado Pago Checkout Pro + webhook

Estado: **BLOQUEANTE — esperando aprobación del Product Owner antes de Fase B.**
Fecha: 2026-10-22. Basado en `PRD.md` §5, §8.4, §9, §10 y Zonas de riesgo;
`CLAUDE.md`; `docs/slices/slice-07-08-tienda-fase-a.md`; el código actual de
`app/api/pedidos/**`, `lib/pedidos/*`, `app/api/notas-venta/[id]/pagar` y
`app/api/pedidos/[id]/convertir`; y la API real de `node_modules/mercadopago`
(v3.6.1).

Este documento NO implementa código. Define contrato, datos, archivos,
sub-slices, riesgos y pruebas. El flag `tienda-pago-online` sigue en `false`
durante todo el desarrollo.

---

## 1. API real del SDK verificada (no supuesta)

Paquete instalado: `mercadopago@3.6.1` (`package.json`, `node_modules/mercadopago/package.json`).
Entry point `dist/index.d.ts`; tipos `dist/clients/**`.

### Import y configuración

```ts
import MercadoPagoConfig, {
  Preference,
  Payment,
  WebhookSignatureValidator,
  InvalidWebhookSignatureError,
} from 'mercadopago';

const config = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: { timeout: 10_000 },
});
```

- `MercadoPagoConfig` (`dist/mercadoPagoConfig.d.ts`): constructor
  `{ accessToken: string; options?: Options }`. `Options` incluye `timeout`,
  `idempotencyKey`, etc.
- No se usa el cliente `Order` (API v2): Checkout Pro es `Preference`.

### Preferencia

`dist/clients/preference/index.d.ts`:

- `new Preference(config).create({ body, requestOptions? })`
  → `Promise<PreferenceResponse>`.
- `get({ preferenceId, requestOptions? })`, `update(...)`, `search(...)`.

`PreferenceRequest` (`dist/clients/preference/commonTypes.d.ts:139`), campos que
usaremos:

| Campo | Tipo | Uso |
|---|---|---|
| `items` | `Items[]` (requerido) | líneas del pedido + despacho |
| `payer.email` | `string` | email del checkout |
| `external_reference` | `string` | `pedido.id` |
| `notification_url` | `string` | webhook |
| `back_urls.success/failure/pending` | `string` | `/pedido/<id>` |
| `auto_return` | `string` | `'approved'` |
| `expires` | `boolean` | `true` |
| `expiration_date_from` | ISO 8601 | ahora |
| `expiration_date_to` | ISO 8601 | `pedidos.expira_en` |

`Items` (`dist/clients/commonTypes.d.ts:40`): `id: string` (requerido),
`title: string`, `quantity: number`, `unit_price: number`,
`currency_id?: string`, `description?`, `picture_url?`.

`PreferenceResponse` (`commonTypes.d.ts:202`) trae `id?: string`,
`init_point?: string`, `sandbox_init_point?: string`, `external_reference?`,
`back_urls?`, `expires?`, `expiration_date_to?`, etc. Usaremos `id` e
`init_point`. Si falta cualquiera de los dos → error de integración.

### Pago

`dist/clients/payment/index.d.ts`:

- `new Payment(config).get({ id, requestOptions? })`
  → `Promise<PaymentResponse>`.

`PaymentResponse` (`dist/clients/payment/commonTypes.d.ts:521`) — campos
verificados que usaremos:

| Campo | Tipo |
|---|---|
| `id` | `number` |
| `status` | `string` (`approved`, `pending`, `in_process`, `rejected`, `cancelled`, `refunded`, `charged_back`, …) |
| `status_detail` | `string` |
| `transaction_amount` | `number` |
| `currency_id` | `string` (`CLP`) |
| `external_reference` | `string` |
| `payer.email` | `string` |
| `date_approved` | `string` |

Nunca se usa el estado/monto del body del webhook: solo `Payment.get`.

### Firma del webhook

`dist/utils/webhook/index.d.ts`:

- `WebhookSignatureValidator.validate({ xSignature, xRequestId, dataId, secret,
  toleranceSeconds?, supportedVersions?, now? })` → `void`; lanza
  `InvalidWebhookSignatureError` con `.reason`.
- Implementación (`dist/utils/webhook/index.js`): HMAC-SHA256 **hex**,
  comparación en tiempo constante, manifest `id:<dataId>;request-id:<xRequestId>;ts:<ts>;`
  omitiendo los pares cuyo valor falta. Versión por defecto `v1`.
- `SignatureFailureReason`: `MissingSignatureHeader`, `MalformedSignatureHeader`,
  `MissingTimestamp`, `MissingHash`, `SignatureMismatch`,
  `TimestampOutOfTolerance`.

**Uso seguro:** exigir `x-signature`, `x-request-id` y `data.id` no vacíos ANTES
de llamar al validador. Así el manifest calculado es exactamente el del diseño
(el SDK omitiría un par faltante y aceptaría una firma más débil).

**Tolerancia:** `toleranceSeconds: 300` en una constante única. Mitiga replay;
la defensa principal sigue siendo la idempotencia. Si en pruebas de sandbox se
comprueba que Mercado Pago reutiliza `ts` en reintentos, se sube la constante
sin tocar el resto.

---

## 2. Hallazgos del código actual que invalidan o condicionan el diseño

1. **`convertir` no es reutilizable desde el webhook.**
   `app/api/pedidos/[id]/convertir/route.ts:18` exige `getServerSession` y
   `:49-50` toma `usuarioId`/`usuarioNombre` de la sesión. El webhook no tiene
   sesión. Hay que extraer el núcleo a `lib/pedidos/convertir.ts` y pasar el
   usuario explícitamente; la ruta conserva auth y mapeo de errores.
2. **`prenotas.usuario_id` y `caja_movimientos.usuario_id` son `NOT NULL`**
   (`migrations/001_prenotas.sql:9-10`, `migrations/014_caja_movimientos.sql:24-25`).
   El webhook no tiene usuario. Decisión: resolver un **usuario sistema**
   (`activo=true`, `rol='admin'`, menor `id`, ver §5.4). Si no existe → 500 y MP
   reintenta; nunca se inventa un id.
3. **No existe API ni UI de `caja_config`.**
   `migrations/012_caja_config.sql` crea la tabla, pero no hay ruta que la lea o
   escriba (grep sobre `app/` y `lib/`). Hay que crear `GET/PATCH /api/caja/config`
   y la sección de cuenta MP en `/admin/caja-config`.
4. **El test de caja-config prohíbe explícitamente la ruta de config.**
   `app/(app)/admin/caja-config/client_page.test.tsx:48-52` afirma
   `fetch = 3` y que no se llama `/api/caja/config`. Debe actualizarse a 4 fetch.
5. **`/pedido/[id]` quedaría detrás del login.**
   `middleware.ts:33-35` solo excluye `api/`, `login`, `catalogo`, `productos`.
   Agregar `pedido/` (con barra, para NO excluir `/pedidos`, que es staff).
6. **`pedidos.estado` no admite `revision`.**
   `migrations/043_pedidos_reserva.sql:5-7` define el CHECK. Monto/currency
   distinto necesita un estado visible para el admin: nueva migración (044).
7. **`POST /api/pedidos` devuelve el pedido idempotente sin datos de pago.**
   `app/api/pedidos/route.ts:82-91` selecciona solo 5 columnas. Debe incluir
   `expira_en`, `mp_preference_id` y `mp_init_point` para reusar la preferencia.
8. **`opciones_entrega` no trae `nombre`.**
   `app/api/pedidos/route.ts:103` selecciona `codigo,costo,requiere_direccion,activa`.
   Ítem "Despacho: <nombre>" exige agregar `nombre` al SELECT y al tipo
   `OpcionEntrega` (`lib/pedidos/precios.ts:29`, como opcional para no romper
   llamadas existentes).
9. **El `RETURNING` del pedido no trae `expira_en`.**
   `app/api/pedidos/route.ts:216-223`. La preferencia necesita
   `expiration_date_to`; se agrega `expira_en::text` al RETURNING.
10. **`caja_movimientos.forma_pago` es libre en DB pero está enumerado en Zod y
    en la UI.** `docs/specs/caja-mayor.spec.ts:47,64` y
    `app/(app)/caja-mayor/client_page.tsx:296,1115,1340` solo conocen
    `efectivo|cheque|transferencia`. Un movimiento `mercadopago` se mostraría
    como "Transf." y, al editarlo, el `<select>` lo convertiría en otro valor.
    Hay que agregar `mercadopago` a schema, tipo, display y opciones del select.
11. **El cobro de una nota no incluye el despacho.**
    `convertir` solo copia `pedido_items` a `prenota_items`; el despacho no es
    una línea. Por eso el total de la nota es `pedido.total - entrega_costo`.
    El cobro del webhook debe registrar el monto real recibido (`pedido.total`)
    pero imputar a la nota solo el total de sus ítems (ver §4.4).
12. **`PATCH /api/pedidos/[id]` no permite descartar `revision`.**
    `app/api/pedidos/[id]/route.ts:35-37` solo acepta
    `pendiente|pendiente_pago|pagado`. Agregar `revision` para que el admin
    pueda devolver el stock de un pago en revisión.
13. **`pedidos-reserva.test.ts` activa el flag y ahora chocará con la
    preferencia.** `__tests__/api/pedidos-reserva.test.ts:13` mockea
    `tienda-pago-online: true`; al integrar Slice 9, ese test debe mockear
    `caja_config`, env y el módulo de preferencia (o el POST devolverá 503/502).
14. **El carrito limpia antes de redirigir.** `components/CarritoDrawer.tsx:80-82`
    hace `limpiar()` y `setOpen(false)`. En Slice 9 debe redirigir a
    `init_point` y solo limpiar si hay URL; sin `init_point` mantiene el
    comportamiento actual (flag `false`).

---

## 3. Decisiones resueltas (delegadas al programador)

| Tema | Decisión |
|---|---|
| MP falla al crear preferencia | **Liberar stock inmediato** y marcar `rechazado`; limpiar `idempotency_key`; responder 502. No esperar 36 h. Evita stock retenido por un pedido que nunca podrá pagarse y permite reintentar al cliente con un pedido nuevo. |
| Preflight | Con flag `true`, antes de reservar stock: validar `MP_ACCESS_TOKEN`, `NEXT_PUBLIC_SITE_URL` y `caja_config.mp_cuenta_id` (cuenta existente). Si falta algo → 503, sin pedido ni stock. |
| Estados nuevos | `revision`, solo para pago cuyo monto/moneda no coincide, pago sobre pedido no online o segundo pago aprobado. No expira automáticamente (no es `pendiente_pago`). |
| Pago aprobado sobre `expirado` o `rechazado` | `pagado_tardio`, sin tocar stock ni crear nota. Revisión manual. (`rechazado` no estaba en el diseño; se incluye porque el stock ya fue devuelto y el dinero sí se cobró.) |
| `mp_payment_id` | Se guarda solo cuando el pago está `approved`. Un `rejected` no lo ocupa: el comprador puede reintentar con otra tarjeta y obtener otro payment id. |
| Idempotencia del cobro | `pedidos.caja_movimiento_id` + índice único parcial + UPDATE condicionado. |
| Usuario del webhook | Primer admin activo. `usuario_nombre='Mercado Pago'` en el movimiento para distinguirlo. |
| `monto_aplicado` del cobro | `LEAST(pedido.total, suma de ítems de la nota)`. El sobrante es despacho y no genera saldo a favor. |
| Página pública | URL con UUID = capability URL. Solo nombre, estado, ítems, entrega, total; nunca teléfono/email/dirección. Sin JS: "Volver a pagar" es un `<a href={init_point}>`. |
| Firma | SDK oficial + exigir los 3 componentes del manifest + tolerancia 300 s. |
| Respuesta del webhook | 200 tras procesar/ignorar; 401 firma inválida; 500 configuración o error transitorio (MP reintenta). |
| Logs | Nunca `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `DATABASE_URL`, email/teléfono del comprador ni el body completo. |

---

## 4. Contrato

### 4.1 Migración `044_mercadopago.sql` (idempotente)

```sql
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS mp_init_point TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS mp_fecha_pago TIMESTAMPTZ;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS mp_revision_motivo TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS caja_movimiento_id UUID
  REFERENCES public.caja_movimientos(id) ON DELETE SET NULL;

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_estado_check
  CHECK (estado IN ('pendiente','convertido','descartado',
                    'pendiente_pago','pagado','rechazado','expirado',
                    'pagado_tardio','revision'));

CREATE UNIQUE INDEX IF NOT EXISTS pedidos_caja_movimiento_unique
  ON public.pedidos (caja_movimiento_id) WHERE caja_movimiento_id IS NOT NULL;
```

Se agrega al final de `scripts/migrations-order.ts`. No se edita 042/043.
`mp_payment_id` e `idempotency_key` ya existen con sus índices únicos (043).

### 4.2 `POST /api/pedidos` (extensión, flag `tienda-pago-online=true`)

Preflight (antes de cualquier escritura):
1. `MP_ACCESS_TOKEN` y `NEXT_PUBLIC_SITE_URL` presentes y URL absoluta.
2. `caja_config.mp_cuenta_id` existe y la cuenta existe en `caja_cuentas`.
   Faltante → `503 { error: 'El pago online no está configurado. Contacta a la tienda.' }`.

Flujo:
1. El alta del pedido + reserva no cambia (Slice 8).
2. Tras el commit, `crearPreferenciaPedido(pedidoId)`:
   - relee pedido e ítems desde DB (nunca del body);
   - arma `items`, despacho, `payer`, `back_urls`, `notification_url`,
     `external_reference`, `expires`, `expiration_date_from/to`;
   - `Preference.create`;
   - exige `id` e `init_point`;
   - `UPDATE pedidos SET mp_preference_id=$, mp_init_point=$ WHERE id=$ AND estado='pendiente_pago'`.
3. Respuesta `201 { data: { …pedido, init_point } }`.
4. Si la preferencia falla → `rechazarPedido(pedidoId)` (stock de vuelta,
   `estado='rechazado'`, `idempotency_key=NULL`) y
   `502 { error: 'No se pudo iniciar el pago. El pedido fue cancelado y el stock liberado. Intenta nuevamente.', pedido_id }`.
5. Replay con la misma `Idempotency-Key`:
   - si el pedido está `pendiente_pago` y tiene `mp_init_point` → `200` con ese init point, sin crear preferencia;
   - si está `pendiente_pago` sin init point → intenta crear preferencia; si falla, `502` sin liberar (no se castiga una reserva viva por un replay);
   - cualquier otro estado → `200` con los datos del pedido y sin init point.

Detalle de la preferencia:

```ts
items = lineas.map(l => ({
  id: String(l.producto_id),
  title: l.detalle ?? l.codigo,
  quantity: l.cantidad,          // cajas o unidades según modalidad
  unit_price: l.precio,          // entero CLP
  currency_id: 'CLP',
}))
if (entrega_costo > 0) items.push({
  id: 'despacho',
  title: `Despacho: ${entrega_nombre ?? entrega_codigo}`,
  quantity: 1,
  unit_price: entrega_costo,
  currency_id: 'CLP',
})
payer = { email: pedido.email_contacto }
external_reference = pedido.id
notification_url = `${siteUrl}/api/mercadopago/webhook`
back_urls = { success: `${siteUrl}/pedido/${id}`, failure: …, pending: … }
auto_return = 'approved'
expires = true
expiration_date_from = new Date().toISOString()
expiration_date_to = new Date(pedido.expira_en).toISOString()
```

`siteUrl()` recorta la barra final. `expira_en` se lee de la DB (no se recalcula
en Node).

### 4.3 Webhook `POST /api/mercadopago/webhook`

`export const dynamic = 'force-dynamic'`.

Request de Mercado Pago: `?data.id=<payment_id>&type=payment`, headers
`x-signature` y `x-request-id`; body `{ action, type, data: { id } }`.

Pasos exactos:
1. `MP_WEBHOOK_SECRET` ausente → `500` (log de configuración, sin secreto).
2. Exigir `x-signature`, `x-request-id`, `data.id` (query). Faltante → `401`.
3. `WebhookSignatureValidator.validate({ xSignature, xRequestId, dataId, secret, toleranceSeconds: 300 })`.
   `InvalidWebhookSignatureError` → `401` (loguear solo `reason` y `requestId`).
4. Tipo: `query.type ?? body.type ?? query.topic`. Si no es `'payment'` → `200 { received: true }` sin consultar el pago.
5. `new Payment(config).get({ id: dataId })`. Error → `500`. **Nunca** se lee
   `status`/`transaction_amount` del body.
6. `external_reference` ausente o pedido inexistente → `200` (log; no es nuestro).
7. Despacho por estado real del pago (tabla §4.4).
8. `200 { received: true }` tras procesar o ignorar.

### 4.4 Máquina de estados del pago

Previo: `claim` atómico del payment id:

```sql
UPDATE pedidos
SET mp_payment_id = $paymentId, mp_fecha_pago = NOW()
WHERE id = $pedidoId AND (mp_payment_id IS NULL OR mp_payment_id = $paymentId)
RETURNING estado, stock_reservado, prenota_id, caja_movimiento_id
```

0 filas → ya hay otro payment id aprobado → `marcarRevision('segundo pago aprobado')`.

| Estado del pago | Estado del pedido antes | Acción |
|---|---|---|
| `approved`, monto ≠ `total` o moneda ≠ `CLP` | cualquiera | `revision` + motivo; no convertir, no tocar stock |
| `approved` | `pendiente_pago` + `stock_reservado` | `pagado` → convertir (sin re-descontar) → cobro |
| `approved` | `pagado` + `stock_reservado` (reintento tras fallo) | convertir → cobro |
| `approved` | `convertido` | solo asegurar cobro (idempotente) |
| `approved` | `expirado` / `rechazado` | `pagado_tardio`; sin stock, sin nota |
| `approved` | `pagado_tardio` | no-op |
| `approved` | `revision` | no-op |
| `approved` | `pendiente` / `descartado` | `revision` (pago sobre pedido no online) |
| `rejected` / `cancelled` | `pendiente_pago` + reserva | `rechazado` + devolver stock una vez |
| `rejected` / `cancelled` | otro | no-op (log) |
| `pending` / `in_process` / `authorized` | cualquiera | no-op |
| `refunded` / `charged_back` | cualquiera | `revision` + motivo (fuera de alcance funcional) |
| desconocido | cualquiera | no-op + log |

`marcarRevision(id, motivo)`:
```sql
UPDATE pedidos
SET estado='revision', mp_revision_motivo=$motivo
WHERE id=$1 AND estado NOT IN ('revision','pagado_tardio')
```
No libera stock: el admin decide desde `/pedidos` (descartar devuelve stock si
`stock_reservado=true`).

`convertirPedido({ pedidoId, usuarioId, usuarioNombre })` (extraído de la ruta):
- mismo SQL y mismas garantías que hoy (`FOR UPDATE` + `WHERE estado='pagado' AND stock_reservado=true`);
- devuelve `{ prenota_id, convertidos, fallidos, items_creados, items_esperados }`;
- si `items_creados < items_esperados` (producto borrado entre reserva y pago),
  el webhook registra el cobro igual y deja `mp_revision_motivo` con el detalle;
  el caso queda visible para revisión (no se pierde el dinero cobrado).

`registrarCobroPedido(pedidoId, paymentId)`:
- exige `estado='convertido'`, `prenota_id` y `caja_movimiento_id IS NULL`;
- `SELECT valor FROM caja_config WHERE clave='mp_cuenta_id'`; ausente → `throw`
  (500, MP reintenta);
- una sola sentencia CTE con `FOR UPDATE` sobre `pedidos`:
  - `caja_movimientos`: `fecha=CURRENT_DATE`, `tipo='cobro'`, `kcodcli2=NULL`,
    `nombre_cliente=pedido.nombre_contacto`, `cuenta_id=mp_cuenta_id`,
    `moneda='CLP'`, `monto=pedido.total`, `forma_pago='mercadopago'`,
    `observaciones='Pedido online <uuid> · Mercado Pago <payment_id>'`,
    `empresa='bazar-naty'`, `es_credito=false`, `usuario_id=sistema.id`,
    `usuario_nombre='Mercado Pago'`;
  - `monto_aplicado = LEAST(pedido.total, suma(prenota_items.subtotal))`;
  - `UPDATE pedidos SET caja_movimiento_id=<mov.id> WHERE caja_movimiento_id IS NULL`;
  - `INSERT caja_movimiento_notas`;
- 0 filas → ya registrado, no-op.

### 4.5 `rechazarPedido(pedidoId)`

Una sentencia CTE, copia exacta del patrón de `PATCH /api/pedidos/[id]`
(`app/api/pedidos/[id]/route.ts:35-66`), con:
- `UPDATE pedidos SET estado='rechazado', stock_reservado=false, idempotency_key=NULL
   WHERE id=$1 AND estado='pendiente_pago'` (la exclusión);
- devolución con `pedido_items.unidades` (nunca recalcular `cantcaja`);
- actualiza `productos` y `ubicaciones_bodega`;
- idempotente: segunda llamada no devuelve stock.

Se usa en: fallo de preferencia (Slice 9) y webhook `rejected`/`cancelled`
(Slice 10).

### 4.6 Página pública `GET /pedido/[id]`

Server component, `dynamic='force-dynamic'`, valida UUID con regex antes de
consultar (`notFound()` si no matchea; evita 22P02). Llama
`liberarReservasVencidas()` con try/catch (misma política que catálogo).
Consulta pedido + ítems + `opciones_entrega.nombre`.

Muestra: nombre de contacto, estado (label), fecha, ítems
(código/detalle/cantidad/subtotal), entrega + costo, total. **No** teléfono,
email ni dirección. Si `estado='pendiente_pago' && mp_init_point` → enlace
"Volver a pagar" a `init_point`. Si `revision` → texto genérico "Pago en
revisión"; sin motivos internos.

### 4.7 `GET/PATCH /api/caja/config` (admin)

- `GET` → `{ data: { mp_cuenta_id: number|null, mp_cuenta_nombre: string|null } }`.
- `PATCH { mp_cuenta_id: number|null }`:
  - `null` → `DELETE FROM caja_config WHERE clave='mp_cuenta_id'`;
  - entero → la cuenta debe existir y estar activa, si no `400`;
  - upsert en `caja_config` con `updated_por`.
- 401 sin sesión, 403 si no es admin.
- La UI es una sección nueva en `/admin/caja-config` (select de cuentas activas +
  guardar). Reutiliza el patrón de la sección de costos de entrega.

### 4.8 `GET /api/pedidos` (staff)

Agregar al SELECT: `p.mp_payment_id`, `p.mp_revision_motivo`,
`p.mp_fecha_pago::text`. La UI muestra pago y motivo cuando
`estado='revision'` o `pagado_tardio`. `ESTADO_LABEL` agrega
`revision: 'Pago en revisión'` y `badgeClass` lo trata como warning.

---

## 5. Inventario por archivo

### 5.1 Nuevos

| Archivo | Propósito | Sub-slice |
|---|---|---|
| `migrations/044_mercadopago.sql` | columnas MP + estado `revision` + link a caja | 9a |
| `lib/mercadopago/config.ts` | `mpConfig()` (access token), `siteUrl()`, `TOLERANCIA_SEGUNDOS` | 9b |
| `lib/pedidos/preferencia.ts` | `crearPreferenciaPedido`, `construirItemsPreferencia` (pura) | 9b |
| `lib/pedidos/rechazar.ts` | `rechazarPedido()` idempotente | 9c |
| `app/pedido/[id]/page.tsx` | estado público del pedido + "Volver a pagar" | 9d |
| `lib/pedidos/usuario-sistema.ts` | `usuarioSistema()` (primer admin activo) | 10a |
| `lib/pedidos/convertir.ts` | núcleo extraído de `convertir` | 10a |
| `app/api/caja/config/route.ts` | GET/PATCH `mp_cuenta_id` | 10b |
| `lib/pedidos/cobro-pedido.ts` | `registrarCobroPedido()` idempotente | 10c |
| `lib/pedidos/pago-aprobado.ts` | transición approved + conversión + cobro | 10c |
| `app/api/mercadopago/webhook/route.ts` | firma + `Payment.get` + dispatch | 10d |
| `__tests__/api/mercadopago-preferencia.test.ts` | builder + SDK mockeado | 9b |
| `__tests__/api/pedidos-mercadopago.test.ts` | preflight, 502, replay | 9c |
| `__tests__/app/pedido/pedido-publico.test.tsx` | privacidad, 404, botón | 9d |
| `__tests__/api/pago-aprobado.test.ts` | máquina de estados | 10c |
| `__tests__/api/mercadopago-webhook.test.ts` | firma, duplicados, montos | 10d |
| `__tests__/api/caja-config-mp.test.ts` | GET/PATCH admin | 10b |

### 5.2 Existentes que se modifican

| Archivo | Cambio | Sub-slice |
|---|---|---|
| `scripts/migrations-order.ts` | agregar 044 al final | 9a |
| `__tests__/slice-00-schema.test.ts` | última migración = 044 | 9a |
| `__tests__/api/productos-precio-mayor.test.ts` | última migración = 044 | 9a |
| `lib/pedidos/precios.ts` | `OpcionEntrega.nombre?: string` | 9c |
| `app/api/pedidos/route.ts` | preflight, `nombre` en entrega, `expira_en` en RETURNING, crear preferencia, 502+liberar, replay con init point | 9c |
| `middleware.ts` | excluir `pedido/` | 9d |
| `components/CarritoDrawer.tsx` | redirigir a `init_point`; limpiar solo si redirige | 9d |
| `app/api/pedidos/[id]/convertir/route.ts` | delega en `lib/pedidos/convertir.ts` | 10a |
| `app/api/pedidos/[id]/route.ts` | permitir descartar `revision` (devuelve stock) | 10a |
| `app/(app)/admin/caja-config/client_page.tsx` | sección cuenta Mercado Pago | 10b |
| `app/(app)/admin/caja-config/client_page.test.tsx` | 4 fetch + mock de config | 10b |
| `app/api/pedidos/route.ts` (GET) | campos MP | 10e |
| `app/(app)/pedidos/client_page.tsx` | label/badge `revision` + motivo | 10e |
| `__tests__/app/pedidos/client_page.test.tsx` | caso revisión | 10e |
| `docs/specs/caja-mayor.spec.ts` | `mercadopago` en enums y tipo | 10e |
| `app/(app)/caja-mayor/client_page.tsx` | display y edición de `mercadopago` | 10e |
| `__tests__/api/pedidos-reserva.test.ts` | mockear preflight/preferencia (flag true) | 9c |
| `__tests__/carrito.test.tsx` | caso `init_point` redirige | 9d |
| `__tests__/api/pedidos-convertir.test.ts` | sigue importando la ruta; verificar mocks tras extracción | 10a |

---

## 6. Impacto lateral (revisión obligatoria Fase A)

Además de los archivos anteriores, se revisó el árbol completo:

- **Navegación/UI:** no hay enlaces nuevos en nav. `/pedido/[id]` es pública y no
  aparece en `RUTAS_POR_ROL` (`lib/rutas-por-rol.ts`); `/pedidos` sigue staff.
- **Middleware:** `middleware.ts:33-35` es el único cambio de acceso. El matcher
  debe usar `pedido/` (con slash) para no abrir `/pedidos`.
- **Tipos compartidos:** `OpcionEntrega` (`lib/pedidos/precios.ts`) y
  `CajaMovimiento.forma_pago` (`docs/specs/caja-mayor.spec.ts:92`) se amplían.
- **DB/migraciones:** solo 044. No se editan 042/043. `scripts/migrations-order.ts`
  y los dos tests que fijan la última migración se actualizan.
- **Permisos:** `/api/caja/config` admin; webhook público con firma; página
  pública por UUID. No se toca NextAuth.
- **Env:** se usan por primera vez `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` y
  `NEXT_PUBLIC_SITE_URL` (hoy no aparecen en el código). Se validan al usar; no
  se agregan a tests con valores reales.
- **Feature flags:** `tienda-pago-online` sigue `false`. No se agrega otro flag.
- **Tests existentes:** los cuatro señalados en §5.2 más
  `pedidos-reserva`, `carrito` y `caja-config`. El resto no se ve afectado.
- **Caja Mayor:** el movimiento `mercadopago` se inserta directo; la UI de
  edición debe conocerlo o lo corrompe al guardar (§2.10).
- **Cron/expiración:** no cambia. `liberarReservasVencidas` no toca `revision`.
- **`docs/referencia-bazar-naty/`:** solo lectura, sin cambios.
- **PRD:** no requiere cambios; la decisión de liberar stock inmediato ante fallo
  de MP y el estado `revision` se documentan aquí y en `BUGS.md` no aplica
  (no es un bug).

---

## 7. Sub-slices (≤200 líneas añadidas/modificadas)

Orden seguro. Cada uno deja el sistema funcionando con el flag en `false`. Los
sub-slices de Slice 10 se implementan con el flag todavía en `false`.

| # | Sub-slice | Archivos | Líneas estimadas |
|---|---|---|---|
| 9a | Migración 044 + orden + tests de schema | migración, `migrations-order`, 2 tests | ~80 |
| 9b | Cliente/config MP + builder de preferencia + tests puros | 2 libs, test | ~170 |
| 9c | POST pedidos: preflight, `expira_en`/`nombre`, crear preferencia, 502+liberar, replay | route, `rechazar.ts`, `precios.ts`, 2 tests | ~190 |
| 9d | Página pública + middleware + redirect del carrito | page, middleware, drawer, 2 tests | ~160 |
| 10a | Extraer `convertir` + usuario sistema + permitir descartar `revision` | 2 libs, 2 rutas, tests | ~190 |
| 10b | API + UI de cuenta MP en caja-config | ruta, client_page, test | ~150 |
| 10c | `registrarCobroPedido` + `pago-aprobado` + tests de estados | 2 libs, test | ~190 |
| 10d | Webhook firmado + dispatch + tests | ruta, test | ~170 |
| 10e | Visibilidad staff de `revision`/pago + `mercadopago` en Caja Mayor | 2 páginas, spec, 2 tests | ~180 |

Dependencias: 9a → 9b → 9c → 9d. 10a → 10b → 10c → 10d → 10e.
El flag `tienda-pago-online=true` se activa **solo** después de 10e verificado
contra la base real y con credenciales de prueba.

---

## 8. Riesgos — checklist PBT-IA

### Firma inválida
- Validación antes de cualquier DB/API; 401 sin filtrar `reason` al cliente.
- Se exigen los 3 componentes del manifest; el SDK compara en tiempo constante.
- Secreto ausente → 500, nunca se acepta "sin firma".
- Test con firma alterada, header ausente, `data.id` cambiado y `v2` no soportado.

### Replay
- `toleranceSeconds=300` (constante única) + idempotencia de estado.
- Replay dentro de la ventana no produce efectos adicionales (mismo payment id,
  mismo pedido, mismo cobro).

### Webhook duplicado
- `mp_payment_id` UNIQUE (043) + `claim` condicionado.
- Conversión con `FOR UPDATE` y `WHERE estado='pagado' AND stock_reservado=true`.
- Cobro con `caja_movimiento_id` UNIQUE parcial y UPDATE condicionado.
- Test de dos entregas idénticas: 1 nota, 1 movimiento, 0 segundo descuento.

### Monto manipulado
- La preferencia se arma desde DB; el body del carrito no aporta precios.
- El webhook ignora el body y usa `Payment.get`.
- `transaction_amount !== pedido.total` o `currency_id !== 'CLP'` → `revision`.
- Test: body del webhook miente (`approved`, monto 1) y la API dice otra cosa.

### Pago tardío
- `expirado`/`rechazado` + approved → `pagado_tardio`; stock no se toca dos veces.
- Visible en `/pedidos`; sin conversión automática.
- Test: pedido expirado con stock ya devuelto → no se descuenta de nuevo.

### MP caído
- Preferencia: 502 + `rechazarPedido` (stock vuelve, pedido rechazado).
- Webhook: `Payment.get` o DB fallan → 500 (MP reintenta); estado resumible.
- Página pública funciona sin MP.
- Timeout del SDK 10 s.
- Test: `Preference.create` rechaza → stock restaurado y pedido `rechazado`.

### Doble conversión
- El `claim` de payment id y la conversión condicionada son independientes y
  ambos idempotentes; un reintento después de convertir solo asegura el cobro.
- Test: aprobado → conversión, luego segundo webhook → no crea segunda nota.

### Consistencia de stock
- Se reutiliza `pedido_items.unidades` para devolver.
- La conversión de reservado no descuenta (`convertir` ya lo cumple).
- `rechazarPedido` y la expiración compiten por la misma fila; solo una devuelve.

### Seguridad / datos
- Webhook público solo con firma; nunca loguear secretos ni datos personales.
- Página pública sin PII salvo nombre; UUID como capability.
- `caja_config` solo admin.

### Riesgos residuales aceptados (documentados)
- Dos POST concurrentes con la misma nueva `Idempotency-Key` pueden crear dos
  preferencias (una queda huérfana en MP); el pedido usa la última guardada.
  El carrito no envía clave: el doble clic lo evita el guard `enviando`.
- Si Mercado Pago reutiliza `ts` en reintentos, la tolerancia de 300 s podría
  rechazarlos; se verifica en sandbox antes de producción.
- Un producto borrado entre reserva y pago produce una nota sin esa línea; el
  cobro se registra completo y queda `mp_revision_motivo` para revisión manual.

---

## 9. Fase B — tests que intentan romper el contrato

### Slice 9 — preferencia
1. Flag `false` → no se llama al SDK y el POST responde como hoy.
2. Preflight sin `MP_ACCESS_TOKEN` → 503, sin pedido ni stock.
3. Preflight sin `NEXT_PUBLIC_SITE_URL` o URL inválida → 503.
4. Preflight sin `mp_cuenta_id` o cuenta inexistente → 503.
5. Body de preferencia: `external_reference=pedido.id`, `payer.email`,
   `notification_url`, 3 `back_urls`, `auto_return='approved'`.
6. `expires=true` y `expiration_date_to` = `expira_en` (ISO, no +36 h calculado
   en Node).
7. Ítems: `unit_price` entero, `currency_id='CLP'`, `quantity=cantidad` de la
   modalidad. Caja: 2 cajas → quantity 2, no 12.
8. `entrega_costo=0` → no hay ítem despacho. `>0` → 1 ítem con el nombre de DB.
9. `Preference.create` lanza → 502, pedido `rechazado`, stock devuelto,
   `idempotency_key=NULL`, respuesta sin secretos.
10. Preferencia sin `init_point` en la respuesta → mismo 502.
11. Replay con la misma clave y `mp_init_point` presente → 200, mismo init
    point, sin segunda llamada al SDK.
12. Replay `pendiente_pago` sin init point → crea preferencia.
13. Replay de pedido `rechazado` → 200 sin init point.
14. Persistencia de `mp_preference_id`/`mp_init_point` solo si el pedido sigue
    `pendiente_pago`.

### Slice 9 — página y carrito
15. UUID inexistente o inválido → 404 (no 500).
16. La página muestra nombre, estado, ítems y total.
17. La página NO contiene teléfono, email ni dirección (aserción sobre el HTML).
18. `pendiente_pago` + init point → enlace "Volver a pagar" con ese href.
19. `expirado`/`rechazado` → sin enlace.
20. Carrito con `init_point` → limpia, cierra y redirige a esa URL.
21. Carrito 502 → no limpia ítems, muestra error.
22. Middleware: `/pedido/<uuid>` público; `/pedidos` sigue requiriendo sesión.

### Slice 10 — webhook y pago
23. Sin `x-signature` / `x-request-id` / `data.id` → 401; `Payment.get` no se llama.
24. Firma alterada → 401; cuerpo y query manipulados no cambian el resultado.
25. Firma válida calculada con el secreto de test → 200.
26. `MP_WEBHOOK_SECRET` ausente → 500; no se procesa.
27. `type` distinto de `payment` → 200 sin `Payment.get`.
28. Body dice `approved` y API dice `pending` → pedido sigue `pendiente_pago`.
29. Body miente el monto y la API devuelve el correcto → se usa la API.
30. Approved + monto = total + CLP + `pendiente_pago` → `pagado` → nota creada
    sin segundo descuento → 1 cobro `mercadopago` en la cuenta configurada.
31. Duplicado del anterior → 1 nota, 1 cobro, sin segundo descuento.
32. Monto distinto → `revision`, sin nota y sin tocar stock.
33. Moneda distinta de CLP → `revision`.
34. Approved sobre `expirado` → `pagado_tardio`, sin nota, stock intacto.
35. Approved sobre `rechazado` → `pagado_tardio`.
36. `rejected` → `rechazado` + stock devuelto; duplicado → segunda devolución 0.
37. `cancelled` → igual que `rejected`.
38. `pending`/`in_process` → sin cambios.
39. Segundo payment id aprobado para el mismo pedido → `revision`, no duplica cobro.
40. `Payment.get` lanza → 500; pedido sin cambios.
41. Conversión falla (sin admin/DB) → pago queda reclamado y stock reservado; el
    reintento completa la conversión y el cobro.
42. Conversión hecha y cobro falla → reintento solo registra el cobro.
43. Cobro: `monto=pedido.total`, `monto_aplicado=suma ítems`, `kcodcli2=NULL`,
    `forma_pago='mercadopago'`, `usuario_nombre='Mercado Pago'`.
44. Sin `mp_cuenta_id` al momento del webhook → 500; no se inserta cobro.
45. Ningún log/respuesta contiene `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` ni email.

### Staff / caja
46. `GET /api/pedidos` incluye `mp_payment_id`, `mp_revision_motivo` y
    `mp_fecha_pago`.
47. `/pedidos` muestra "Pago en revisión" y el motivo.
48. Descartar un pedido `revision` con stock reservado devuelve stock una vez.
49. Caja Mayor muestra "Mercado Pago" y al editar conserva `mercadopago`.
50. Schemas de caja aceptan `mercadopago`.
51. `GET/PATCH /api/caja/config`: 401/403, cuenta inexistente 400, `null` borra,
    upsert con `updated_por`.

### Regresión
52. `pedidos.test.ts`, `pedidos-reserva.test.ts`, `pedidos-id.test.ts`,
    `pedidos-convertir.test.ts`, `pedidos-precios-server.test.ts`,
    `notas-venta-items-post-stock.test.ts`, `carrito.test.tsx`,
    `caja-config/client_page.test.tsx`, `app/pedidos/client_page.test.tsx`,
    `slice-00-schema.test.ts`, `productos-precio-mayor.test.ts`.
53. `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build`.

---

## 10. Comandos de verificación

```bash
# 1. Migraciones y orden
npm run test -- __tests__/slice-00-schema.test.ts __tests__/api/productos-precio-mayor.test.ts

# 2. Tests nuevos (con SDK y fetch mockeados; sin credenciales)
npm run test -- __tests__/api/mercadopago-preferencia.test.ts
npm run test -- __tests__/api/pedidos-mercadopago.test.ts
npm run test -- __tests__/app/pedido/pedido-publico.test.tsx
npm run test -- __tests__/api/pago-aprobado.test.ts
npm run test -- __tests__/api/mercadopago-webhook.test.ts
npm run test -- __tests__/api/caja-config-mp.test.ts

# 3. Regresión
npm run test
npx tsc --noEmit
npm run lint
npm run build

# 4. Aplicar 044 contra la DB real (branch production)
npm run migrate

# 5. Verificar schema real (Neon SQL editor / psql)
#   SELECT column_name, data_type FROM information_schema.columns
#    WHERE table_name='pedidos' AND column_name LIKE 'mp_%' OR column_name='caja_movimiento_id';
#   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
#    WHERE conrelid='pedidos'::regclass AND conname='pedidos_estado_check';
#   SELECT indexname FROM pg_indexes WHERE tablename='pedidos';
#   SELECT clave, valor FROM caja_config WHERE clave='mp_cuenta_id';
```

## 11. Checklist manual antes de activar `tienda-pago-online=true`

- [ ] 044 aplicada y verificada contra la base real.
- [ ] `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` de **prueba** en Vercel y `.env.local`.
- [ ] `NEXT_PUBLIC_SITE_URL` apunta a un dominio HTTPS accesible por MP (preview
      de Vercel o túnel). Sin esto no se puede probar el webhook.
- [ ] Cuenta "Mercado Pago" creada en `/admin/caja-config` y guardada como
      `mp_cuenta_id`.
- [ ] Compra de punta a punta en sandbox: preferencia → pago → webhook → pedido
      `convertido` → nota → cobro en Caja Mayor.
- [ ] Reenvío manual del webhook desde el panel de MP: no duplica nota ni cobro.
- [ ] Pago rechazado: pedido `rechazado` y stock devuelto una sola vez.
- [ ] Pedido expirado + pago aprobado: `pagado_tardio` sin descuento de stock.
- [ ] `/pedido/<uuid>` abre sin sesión y no muestra datos personales.

## 12. Fuera de alcance

- Reembolsos vía API de MP, `refunded`/`charged_back` automáticos.
- Boleta electrónica SII.
- Creación de preferencia al vuelo desde `/pedido/[id]` cuando no existe
  `mp_init_point` (solo se reusa el guardado).
- Notificaciones por email/WhatsApp al comprador o al staff.
- Conciliación bancaria automática de la cuenta Mercado Pago.
