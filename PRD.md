# PRD — La Esquina de las Novedades (ERP + e-commerce)

## 1. Qué es el proyecto

ERP de ventas, inventario y caja para LA ESQUINA DE LAS NOVEDADES SPA
(Iquique, Chile), con tienda online donde el cliente arma su pedido y lo
paga con Mercado Pago en el mismo momento.

Origen técnico: copia del repositorio `bazar-naty`
(https://github.com/pablovitalisant-pbt/bazar-naty), sin su historial de git.
No es un proyecto desde cero: se adapta un sistema que ya está en producción.
La documentación de Bazar Naty (PRD, BUGS, contexto, migración Vercel) queda
como referencia en `docs/referencia-bazar-naty/`.

Principio de diseño heredado: **muy simple y fácil de usar**. Ante la duda,
gana la solución más simple.

## 2. Usuarios y roles

Una sola empresa (sin multitenant).

| Rol | Acceso | Usuarios iniciales |
|---|---|---|
| Administración | Todo, incluido inventario/bodega | 2 |
| Ventas | Notas de venta, precios, clientes, pedidos | 2 |
| Cliente web (sin login) | Tienda online: ver productos, carrito, pagar | público |

No se usa el rol Bodega: los administradores manejan el inventario. El rol
puede quedar en código pero no se ofrece en el selector de usuarios.

## 3. MVP

1. **Rebranding + Chile**: nombre, logo, colores, landing, metadata, `es-CL`,
   etiqueta "RUT" en usuarios/login.
2. **Moneda única CLP**: eliminar USD/ARS, tipo de cambio y `dolar_dia`.
3. **Venta mayorista y detalle**: cada producto tiene precio detalle y precio
   mayor (ambos por unidad). En notas de venta el vendedor elige por línea;
   en la tienda online el precio mayor se aplica solo como descuento desde
   `minimo_mayor` unidades. Mismo inventario, todo en unidades.
4. **Notas de venta con tipo** (mayor / menor / mixta, derivado de los ítems).
5. **Clientes con etiqueta**: todos los clientes quedan registrados; etiqueta
   derivada de su historial de compras: `mayorista`, `minorista` o `ambos`.
6. **Tienda online con pago Mercado Pago (Checkout Pro)**: carrito con
   unidades y descuento especial por mayor, despacho, reserva de stock, pago, webhook, conversión
   automática a nota de venta y cobro en caja.
7. **Módulos heredados que siguen**: Precios, Catálogo (admin + público),
   Categorías, Bodega (ingresos, conciliación), Usuarios, Config de caja,
   Caja Mayor, Clientes, Deudores, Alertas de stock bajo, Pedidos (staff),
   Inversión en mercadería.

## 4. Qué NO es parte del MVP

- Boleta electrónica SII (la clienta dice que la gestiona Mercado Pago; hay
  que verificar si cubre las ventas online. No se integra en el MVP)
- Cotización / cobro automático del envío a Arica (se paga al chofer)
- Reembolsos dentro del sistema vía API de Mercado Pago (se gestionan a mano)
- Modo offline / PowerSync (se elimina; nunca funcionó en Bazar Naty)
- Cuentas de cliente con login en la tienda
- IA (despachos-ia, etc.)
- Módulo Ventas/Kardex (ya estaba deshabilitado en Bazar Naty)

## 5. Integraciones externas

| Servicio | Uso | Cuenta |
|---|---|---|
| Neon Postgres | Base de datos | org `org-lucky-math-65013365`, proyecto `steep-shape-55022986`, branch `production` |
| Vercel | Hosting + deploy | cuenta de la clienta (contactogvingenieria@gmail.com) |
| Cloudinary | Imágenes de productos | cuenta de la clienta |
| Mercado Pago (Chile) | Checkout Pro + webhooks | cuenta de la empresa (laesquinadelasnovedades2860@gmail.com) |
| Namecheap | Dominio `laesquinadelasnovedades.store` | cuenta de la clienta |

### Mercado Pago — referencias verificadas (2026-10-22)
- Checkout Pro requiere cuenta vendedor, credenciales (prueba y producción) y
  SSL: https://mercadopago.cl/developers/en/docs/checkout-pro/requirements
- La preferencia acepta `external_reference`, `notification_url`, `back_urls`,
  `auto_return`, `expires`, `expiration_date_from/to`:
  https://www.mercadopago.com/developers/en/docs/checkout-pro/checkout-customization/preferences
- Webhooks: tópico `payment`; validar `x-signature` con HMAC-SHA256 (hex)
  sobre el manifest `id:[data.id];request-id:[x-request-id];ts:[ts];` usando la
  clave secreta del panel de la aplicación; luego consultar
  `GET https://api.mercadopago.com/v1/payments/{id}`:
  https://www.mercadopago.cl/developers/es/docs/your-integrations/notifications/webhooks
- SDK oficial Node: paquete npm `mercadopago` (v3.6.1 al 2026-10-22).

## 6. Restricciones técnicas

Stack confirmado por Pablo (2026-10-22), igual a bazar-naty:
- Next.js 15.5 (App Router) + React 18 + TypeScript
- Neon Postgres con `@neondatabase/serverless`
- NextAuth 4
- Tailwind + shadcn/ui, skill de diseño en `design-skill/`
- Cloudinary
- Mercado Pago Checkout Pro con SDK `mercadopago`
- Jest + Testing Library
- Vercel. Si la cuenta es Hobby: cron solo 1 vez al día (verificado en
  https://vercel.com/docs/cron-jobs/usage-and-pricing). El diseño de
  expiración NO depende de un cron frecuente (ver §8.4).

## 7. Escala esperada

4 usuarios internos. Tienda pública con tráfico bajo-medio de clientes de
Iquique, Alto Hospicio y Arica.

## 8. Reglas de negocio confirmadas

### 8.1 Empresa
- Razón social: LA ESQUINA DE LAS NOVEDADES SPA — RUT 78.211.131-0
- Dirección: Avenida Aeropuerto 2860, Iquique. Horario 11:00–20:00 (editable)
- WhatsApp: +56 9 7340 9133. Redes: Facebook, Instagram, TikTok
  ("La Esquina de las Novedades")

### 8.2 Moneda y precios
- Solo CLP, sin decimales en la UI.
- Cada producto tiene: `costo` (obligatorio al crear), `prcventa` = precio
  detalle por unidad, `precio_mayor` = precio mayor por unidad (opcional,
  menor que el detalle) y `minimo_mayor` = unidades desde las que la tienda
  online aplica el precio mayor (opcional). Los precios se ingresan directo;
  el % de ganancia lo calcula el servidor desde el costo (cambiar el costo no
  cambia precios). `cantcaja` queda solo para bodega.
- Catálogos: precio = precio especial del catálogo (`catalogo_precio_override`)
  si existe; si no, `prcventa`. No hay % sobre costo por catálogo.
- La comisión de Mercado Pago la absorbe la tienda (precios ya la consideran).

> **Decisiones de Pablo y Paola (2026-10-29):** no existe venta por caja. Reemplazan la regla "desde 3 unidades" del 2026-10-26 (slices 2-4, ver `AUTO-LOG.md`).

### 8.3 Mayorista vs detalle
- Un solo inventario en unidades (`productos.saldo`).
- Cada ítem de nota de venta / pedido tiene `modalidad` = `detalle` | `mayor`
  y `subtotal = unidades * precio`. El tipo de la nota se deriva: todo mayor →
  `mayor`; todo detalle → `menor`; ambos → `mixta`.
- **Notas de venta:** el vendedor elige detalle o mayor en cada línea, con
  cualquier cantidad, y puede cambiarlo; el precio por defecto es el de la
  modalidad y se puede ajustar a mano.
- **Tienda online y catálogos:** se muestra solo el precio detalle. El servidor
  aplica el precio mayor ("Descuento especial") cuando la cantidad total del
  producto llega a `minimo_mayor` (flag `tienda-mayor-online`). El cliente no
  elige modalidad.

### 8.4 Pedido online y pago
- El cliente paga **al hacer el pedido**.
- Datos obligatorios del pedido: nombre, teléfono, email (Mercado Pago lo
  pide), modalidad de entrega y dirección si es delivery.
- Todo pedido crea o reutiliza un **cliente registrado** (match por teléfono
  normalizado, lógica existente en `app/api/pedidos/route.ts`).
- Estados del pedido: `pendiente_pago` → `pagado` | `rechazado` | `expirado`
  (+ estados heredados `convertido` / `descartado` para staff).
- **Reserva de stock**: al crear el pedido se descuenta `saldo` de forma
  atómica (patrón `UPDATE ... WHERE saldo >= x`). Si falla, el pedido no se crea.
- **Expiración: 36 horas** sin pago → `expirado` y se devuelve el stock.
  La preferencia de MP se crea con `expires=true` y `expiration_date_to` =
  creación + 36 h. La liberación es *perezosa*: una función idempotente
  `liberarReservasVencidas()` se ejecuta al inicio de los endpoints que leen o
  escriben stock (crear pedido, agregar ítem a nota, listado público) y
  además un cron diario de respaldo.
- **Pago aprobado (webhook validado)** → pedido `pagado`, se crea la nota de
  venta automáticamente con sus ítems y tipo, y un cobro en Caja Mayor en la
  cuenta configurada como "Mercado Pago". El webhook debe ser idempotente
  (MP reintenta notificaciones).
- Pago rechazado/cancelado → el pedido sigue `pendiente_pago` y el stock sigue reservado: el comprador puede reintentar en la misma preferencia. El stock se libera solo al expirar (36 h) o si falla la creación de la preferencia (decisión DT 2026-10-22, ver `app/api/mercadopago/webhook/route.ts`).
- Pago aprobado sobre un pedido ya `expirado` → no se pierde: queda marcado
  `pagado_tardio` para revisión manual del admin (reponer stock o reembolsar).

### 8.5 Entrega
| Modalidad | Costo en checkout |
|---|---|
| Retiro en tienda | $0 |
| Delivery Iquique | $3.000 |
| Delivery Alto Hospicio | $4.000 |
| Envío a Arica (transporte externo) | $0 en checkout — se paga al chofer según tamaño |

Los costos deben quedar configurables por admin (no hardcodeados en JSX).

### 8.6 Reembolsos
Se aceptan; se prefiere cambio por otro artículo. Devolución por
transferencia o efectivo, fuera de Mercado Pago. El sistema solo registra
(módulo de reembolso heredado de notas de venta).

### 8.7 Caja
Cajas configurables desde `/admin/caja-config` (la app permite crear las
que se necesiten). Iniciales sugeridas: 3 cuentas bancarias, "Caja diaria
(efectivo)" y "Mercado Pago".

## 9. Plan de slices sugerido (orden)

| # | Slice | Notas |
|---|---|---|
| 0 | ✅ COMPLETADO — Neon + schema desde cero | Ver §10.1. Aplicar `migrations/` en orden contra la DB vacía y verificar que el schema real cubre todo lo que el código consulta. Seed: empresa + admin |
| 1 | ✅ COMPLETADO — Rebranding Chile | LandingPage, layout metadata, catálogo, logo, `es-BO`→`es-CL`, "Documento de identidad"→"RUT" |
| 2 | ✅ COMPLETADO — CLP única moneda | ~22 archivos con USD/ARS/tipo de cambio. Probablemente sub-slices |
| 3 | ✅ COMPLETADO — Eliminar PowerSync / offline | `lib/powersync/*`, `api/powersync/token`, `admin/powersync-status`, `admin/sync-conflictos`, flags `*-offline-*`, `app/sw.ts`, `app/offline`, `components/AlertasBell`, `contexts/AlertasContext` (revisar dependencia) |
| 4 | ✅ COMPLETADO — Precio mayorista por caja | columna nueva en `productos`, UI de precios y edición |
| 5 | ✅ COMPLETADO — Modalidad unidad/caja en notas de venta + tipo derivado | `prenota_items` ya tiene `cajas` y `unidades` |
| 6 | ✅ COMPLETADO — Etiqueta de cliente | derivada del historial (vista o query), visible en `/clientes` |
| 7 | ✅ COMPLETADO — Tienda: carrito con modalidad + entrega + email | reusa `pedidos-publicos` / `carrito-pedidos-ui` |
| 8 | ✅ COMPLETADO — Reserva de stock + expiración 36 h | §8.4 |
| 9 | ✅ COMPLETADO (verificado con pago real de prueba 2026-10-23; faltan credenciales de producción) — Mercado Pago: preferencia + redirect + back_urls | credenciales de prueba |
| 10 | ✅ COMPLETADO (verificado con pago real de prueba 2026-10-23, BUG-005; faltan credenciales de producción) — Webhook firmado + conversión a nota + cobro en caja | idempotente |
| 11 | Deploy producción | dominio Namecheap → Vercel, credenciales de producción, Señal 3. Desglosado en `docs/BACKLOG.md` |

## 10. Riesgos y notas técnicas

### 10.1 Schema en DB vacía (riesgo alto)
Bazar Naty arrancó su DB desde un dump y migraciones aplicadas a mano; no hay
runner de migraciones y faltan números (004–007). BUG-063 de Bazar Naty: una
migración commiteada puede no estar aplicada. Antes de cualquier slice
funcional hay que comprobar que `migrations/` recrea el schema completo en
una DB vacía. Si falta algo, se crea una migración nueva — no se edita
historia.

### 10.2 Setup Neon (instrucciones de la consola Neon)
```
npm i -g neon@latest   (o npx neon@latest)
neon init -y --org-id org-lucky-math-65013365 --project-id steep-shape-55022986 --branch production --services postgres
neon deploy
```
`neon deploy` escribe las env vars en `.env.local` (o `.env` si existe).
El código usa `DATABASE_URL`; verificar el nombre real de la variable que
genera Neon y mapearla. El driver existente es `@neondatabase/serverless`
(HTTP), adecuado para Vercel serverless.

### 10.3 Variables de entorno esperadas
`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`,
`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`.
Eliminar `POWERSYNC_*`. Validar al arrancar las requeridas.

### 10.4 Pendientes de la clienta
- Logo (PNG) y colores. Falta el logo real: los PNG actuales de `public/`
  (`logo-*.png`) son de Bazar Naty y no se usan; la UI y el PDF de notas
  muestran un wordmark de texto con `EMPRESA.nombre` hasta recibirlo.
- Redes (Facebook, Instagram, TikTok "La Esquina de las Novedades"): faltan URLs verificadas; hoy solo texto.
- Excel de productos (código, nombre, categoría, precio detalle, precio
  mayorista por caja, unidades por caja, stock, stock mínimo) y fotos
- Nombres y emails de los 4 usuarios
- Aplicación en Mercado Pago + credenciales de prueba + clave secreta webhook
- Confirmar si la boleta electrónica de MP cubre ventas online

## POS v1

Punto de venta (contrato aprobado 2026-10-29). Flag `pos-v1`.

- **Ruta `/pos`**: página de inicio post-login para admin y vendedor
  (bodeguero sigue a `/bodega`).
- **Teclado y mouse/táctil, 100% manejable**: teclear cualquier carácter
  enfoca la búsqueda; flechas + Enter agregan; lector de barras = código
  exacto agrega; `+`/`-` ajustan la cantidad de la línea seleccionada; F2
  alterna MENOR/MAYOR; Supr quita la línea; F4 cliente; F9 o Ctrl+Enter
  COBRAR; Esc cierra el diálogo o vuelve a la búsqueda. Teclado numérico en
  pantalla solo opcional.
- **Panel COBRAR**: monto enfocado con el total precargado, Enter confirma,
  vuelto en vivo. Formas de pago: 1 EFECTIVO, 2 TARJETA, 3 TRANSFERENCIA,
  4 CHEQUE. Cuenta de caja predeterminada por usuario (localStorage por id de
  usuario) con selector siempre visible. Pago parcial permitido (el saldo
  queda en Deudores). Al confirmar: Imprimir PDF, WhatsApp, Nueva venta.
- **Sin cliente** -> "Cliente de mesón" genérico.
- **Slices**: pos1 TARJETA como forma de pago; pos2 `/pos` búsqueda + grilla
  + nota + atajos; pos3 panel COBRAR; pos4 redirección de inicio + PWA + móvil.

### pos1 — TARJETA como forma de pago

Registro del cobro; el cobro físico ocurre en la maquinita de Mercado Pago.
`forma_pago` acepta `tarjeta` en `/api/notas-venta/[id]/pagar`, en el diálogo
de pago y en todos los lugares que enumeran formas de pago (Caja Mayor,
schemas y tipos compartidos). No requiere migración: la columna
`caja_movimientos.forma_pago` es `TEXT` sin `CHECK`.

## Zonas de riesgo conocidas

| Archivo / módulo | Riesgo | Qué no tocar sin revisar |
|-----------------|--------|--------------------------|
| (se completa durante el desarrollo) | | |
| scripts/migrations-order.ts | Toda migración nueva debe agregarse al final de MIGRATION_ORDER (el test lo exige) | No reordenar ni editar migraciones aplicadas |
| app/api/mercadopago/webhook/route.ts + `MP_WEBHOOK_SECRET` | BUG-005: la firma se valida con la clave de la app DUEÑA de las credenciales que cobran (desde 2026-10-26: app de producción "La Esquina de las Novedades - Tienda", 8021659669573211, Modo productivo). "Simular notificación" firma con la clave de la app desde donde se envía y NO prueba pagos reales | Cambiar token/clave siempre en pareja (misma app y modo) + redeploy + pago real como criterio |
| app/api/mercadopago/webhook/route.ts (IPN legacy) | Notificaciones `Feed v2.0` (`?id=&topic=`) sin firma: se responden 200 sin procesar (flag `mp-webhook-ignorar-ipn-legacy`). Si se procesaran, sería un bypass de la firma | No procesar nada sin `data.id` firmado |
| lib/pedidos/reserva-stock.ts | BUG-003: el guard `1 / (SELECT COUNT(*) FROM upd)` es lo que aborta la reserva sin stock; `CASE ... ELSE 1/0` se pliega en Postgres y falla siempre | Probar cualquier cambio contra Postgres real (`__tests__/integration/reserva-stock-guard.test.ts`) |
| lib/precio-catalogo.ts | El precio de catálogo se usa para mostrar Y para cobrar (`/api/pedidos`); la preferencia MP redondea cada ítem a entero | Mantener CLP entero; cualquier cambio de fórmula afecta cobros |
| lib/precio-tienda.ts | La misma función decide el descuento por mayor en el carrito (estimado) y en el cobro server-side | Cambios siempre vía esta función; probar con flag true y false |
| Migraciones con varias sentencias | El driver HTTP de neon no acepta multi-statement: aplicar con `Pool` (como `scripts/apply-migrations.ts`); `npm run migrate` completo falla en test-integration desde la 019 | Aplicar la migración nueva sola, en transacción, y verificar en information_schema |
| config/feature-flags.json en tests | BUG-004: tests que leen el JSON real se rompen al activar flags | Mockear flags explícitamente en cada test |
| instrumentation.ts / lib/env.ts | Valida variables al arrancar y solo loguea (no tumba la app) | No imprimir valores; mantener listas al día al agregar variables |
