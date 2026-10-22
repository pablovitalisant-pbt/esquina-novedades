# Fase A — Slices 7 y 8: tienda con entrega + reserva de stock (36 h)

Estado: **BLOQUEANTE — esperando aprobación del Product Owner antes de Fase B.**
Fecha: 2026-10-22. Basado en `PRD.md` §8.3–8.5, §9, §10 y Zonas de riesgo.

Este contrato NO implementa código. Define datos, APIs, archivos, sub-slices,
riesgos y pruebas. Producción no tiene pedidos: las migraciones pueden endurecer
columnas sin backfill.

---

## 1. Decisiones fijas del Director Técnico

- Carrito mixto: cada ítem lleva `modalidad` (`unidad` | `caja`).
  - `unidad` → precio unitario `productos.prcventa`.
  - `caja` → precio por caja `productos.precio_mayor`; exige
    `precio_mayor > 0` y `cantcaja > 0`. Si no, 400. Unidades descontadas =
    `cantidad * cantcaja`.
- Precios, subtotales, costo de entrega y total SIEMPRE se calculan en el
  servidor leyendo `productos` y `opciones_entrega`. Se ignoran
  `precio_referencia`, `precio`, `entrega_costo` y `total` del cliente.
- Opciones de entrega en tabla propia, no hardcodeadas en JSX.
- Reserva con flag `tienda-pago-online`:
  - `false`: flujo actual → `estado='pendiente'`, sin reserva, staff convierte.
  - `true`: `estado='pendiente_pago'`, descuenta stock atómico, `expira_en = now() + 36 h`.
- Liberación perezosa idempotente, una sola sentencia CTE, llamada al inicio de
  POST pedido, POST ítem de nota y lecturas públicas de productos; cron diario
  como respaldo.
- `convertir` preparado para pedidos con stock ya reservado: no vuelve a descontar.
  Se agrega `pedidos.stock_reservado BOOLEAN NOT NULL DEFAULT false` como marca
  explícita (no inferir por estado: `pagado_tardio` NO tiene stock reservado).

## 2. Puntos que el código actual invalida o exige decidir

1. **Precio de catálogo vs. precio cobrado (BLOQUEANTE).**
   `app/catalogo/[slug]/page.tsx:112` calcula `precio_catalogo` como
   `costo * (1 + margen/100)` y `:122` aplica `precio_override`. El diseño dice
   que `unidad` se cobra a `productos.prcventa`. Si no se unifica, el visitante
   del catálogo ve un precio y el checkout cobra otro.
   Recomendación: en `origen='catalogo'`, el servidor recalcula el mismo precio
   de catálogo (costo + margen + override) desde DB; sigue siendo server-side y
   nunca confía en el cliente. Alternativa: catálogo muestra `prcventa` y se
   retira el margen para pedidos online. **Requiere aprobación.**
2. **Semántica actual de cantidad.** `contexts/CarritoContext.tsx:12` define
   `cantidad` como cajas y `components/CarritoDrawer.tsx:29` multiplica por
   `cantcaja` siempre. `app/productos/client_page.tsx:92` agrega 1 caja con
   precio unitario. Slice 7 corrige: `cantidad` pasa a ser cantidad de la
   modalidad del ítem y el precio mostrado depende de `modalidad`.
3. **Deduplicación del carrito.** `contexts/CarritoContext.tsx:89-92` deduplica
   solo por `producto_id`; con carrito mixto debe deduplicar por
   `producto_id + modalidad`.
4. **`convertir` solo acepta `pendiente`** (`app/api/pedidos/[id]/convertir/route.ts:38`)
   y siempre descuenta stock (`:83`). Debe distinguir `stock_reservado`.
5. **Índice único de migraciones en tests.** `__tests__/slice-00-schema.test.ts:104`
   y `__tests__/api/productos-precio-mayor.test.ts:101` afirman que 041 es la
   última migración. Se actualizan al nuevo número final.
6. **Supuesto verificado:** `productos` tiene `UNIQUE(empresa_id, codigo)`
   (`migrations/003_core_tables.sql:50`) y `ubicaciones_bodega`
   `UNIQUE(empresa_id, codigo)` (`:66`). Por eso reservar por `producto_id` y
   devolver por `codigo` es 1:1. Si en el futuro se permiten duplicados por
   código, la devolución debe agrupar por código y actualizar todas las filas.

---

## 3. Inventario de archivos

### 3.1 Nuevos

| Archivo | Propósito | Sub-slice |
|---|---|---|
| `migrations/042_opciones_entrega_checkout.sql` | tabla `opciones_entrega` + seed; columnas de checkout en `pedidos`/`pedido_items`/`clientes` | 7a |
| `migrations/043_pedidos_reserva.sql` | estados nuevos, `expira_en`, MP ids, `stock_reservado`, índices | 8a |
| `lib/pedidos/precios.ts` | cálculo server-side de precio/subtotal/total y validación de modalidad | 7b |
| `lib/pedidos/liberar-reservas.ts` | `liberarReservasVencidas()` (CTE única) + guard de flag | 8a |
| `app/api/entrega/opciones/route.ts` | GET público de opciones activas | 7a |
| `app/api/entrega/opciones/[codigo]/route.ts` | PATCH admin (costo, activa, orden, requiere_direccion, nota) | 7a |
| `app/api/cron/liberar-reservas/route.ts` | GET protegido con `CRON_SECRET` | 8c |
| `components/CarritoCheckoutForm.tsx` | email + opción de entrega + dirección, validación cliente | 7d |
| `components/SelectorModalidad.tsx` | unidad/caja por producto, muestra precio y stock | 7c |
| `__tests__/api/pedidos-reserva.test.ts` | Fase B reserva/409/flag | 8b |
| `__tests__/api/liberar-reservas.test.ts` | Fase B idempotencia/concurrencia | 8a |
| `__tests__/api/entrega-opciones.test.ts` | Fase B opciones/validación | 7a |
| `__tests__/api/pedidos-precios-server.test.ts` | Fase B precios manipulados | 7b |
| `__tests__/api/cron-liberar-reservas.test.ts` | Fase B auth del cron | 8c |

### 3.2 Existentes que se modifican

| Archivo | Cambio obligatorio |
|---|---|
| `app/api/pedidos/route.ts` | POST: email/entrega/total + precios server-side + transacción de reserva + 409. GET: nuevos campos e ítems con modalidad/subtotal. Llamada a `liberarReservasVencidas()` |
| `app/api/pedidos/[id]/route.ts` | PATCH: no permitir descartar estados con stock reservado sin liberar (o restringir a `pendiente` y declararlo) |
| `app/api/pedidos/[id]/convertir/route.ts` | Permitir `pendiente` (descuenta) y `pagado` con `stock_reservado` (NO descuenta); insertar ítems con modalidad |
| `app/api/notas-venta/[id]/items/route.ts` | Llamar `liberarReservasVencidas()` al inicio (antes del UPDATE de stock, `:90`) |
| `app/api/catalogos/public/[slug]/route.ts` | Llamar liberación; seleccionar `prcventa` y `precio_mayor` |
| `app/productos/page.tsx` | Llamar liberación; seleccionar `prcventa` y `precio_mayor` |
| `app/catalogo/[slug]/page.tsx` | Llamar liberación; seleccionar `precio_mayor`; resolver punto 2.1 |
| `app/productos/client_page.tsx` | Pasar `modalidad`, `precio_mayor` y stock al botón (`:92`) |
| `app/catalogo/[slug]/client_page.tsx` | Ídem (`:84`) |
| `contexts/CarritoContext.tsx` | `ItemCarrito` + `modalidad`, `email`; dedupe por producto+modalidad; total por modalidad |
| `components/BotonAgregarPedido.tsx` | Flujo con selector o dos botones (unidad/caja) y validación de caja disponible |
| `components/CarritoGateModal.tsx` | Agregar email obligatorio (nombre/teléfono/email) |
| `components/CarritoDrawer.tsx` | Mostrar modalidad/subtotal; checkout con entrega y dirección; enviar solo IDs+modalidad+cantidad (no precios) |
| `app/(app)/pedidos/client_page.tsx` | Estados nuevos, email, entrega, dirección, total, modalidad/subtotal; acciones solo en estados válidos |
| `app/(app)/admin/caja-config/client_page.tsx` | Sección compacta de costos de entrega (evita página/ruta/nav nuevos) |
| `config/feature-flags.json` | `"tienda-pago-online": false` |
| `scripts/migrations-order.ts` | Agregar 042 y 043 al final, en orden |
| `vercel.json` | Cron diario `/api/cron/liberar-reservas` (Hobby: 1/día) |
| `__tests__/api/pedidos.test.ts` | Body válido con email/entrega; orden de llamadas SQL |
| `__tests__/api/pedidos-convertir.test.ts` | Caso reservado no descuenta |
| `__tests__/api/notas-venta-items-post-stock.test.ts` | Índices de `sql.mock.calls` corren por la llamada de liberación |
| `__tests__/app/pedidos/client_page.test.tsx` | Nuevos campos/estados |
| `__tests__/api/productos-precio-mayor.test.ts` | Última migración = 043 |
| `__tests__/slice-00-schema.test.ts` | Última migración = 043 |

---

## 4. Contrato de datos

### 4.1 `042_opciones_entrega_checkout.sql` (idempotente)

```sql
CREATE TABLE IF NOT EXISTS public.opciones_entrega (
  codigo             TEXT PRIMARY KEY,
  nombre             TEXT NOT NULL,
  costo              INTEGER NOT NULL DEFAULT 0 CHECK (costo >= 0),
  requiere_direccion BOOLEAN NOT NULL DEFAULT false,
  activa             BOOLEAN NOT NULL DEFAULT true,
  orden              INTEGER NOT NULL DEFAULT 0,
  nota               TEXT
);

INSERT INTO public.opciones_entrega (codigo,nombre,costo,requiere_direccion,activa,orden,nota)
VALUES
  ('retiro','Retiro en tienda',0,false,true,1,NULL),
  ('delivery_iquique','Delivery Iquique',3000,true,true,2,NULL),
  ('delivery_alto_hospicio','Delivery Alto Hospicio',4000,true,true,3,NULL),
  ('envio_arica','Envío a Arica',0,true,true,4,'Se paga al chofer según tamaño')
ON CONFLICT (codigo) DO NOTHING;
```

`clientes`:
```sql
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS email TEXT;
```

`pedidos` (checkout):
```sql
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS email_contacto TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS entrega_codigo TEXT REFERENCES public.opciones_entrega(codigo);
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS entrega_costo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS direccion_entrega TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS total INTEGER NOT NULL DEFAULT 0;
```

`pedido_items`:
```sql
ALTER TABLE public.pedido_items ADD COLUMN IF NOT EXISTS modalidad TEXT NOT NULL DEFAULT 'unidad'
  CHECK (modalidad IN ('unidad','caja'));
ALTER TABLE public.pedido_items ADD COLUMN IF NOT EXISTS precio INTEGER NOT NULL DEFAULT 0
  CHECK (precio >= 0);
ALTER TABLE public.pedido_items ADD COLUMN IF NOT EXISTS subtotal INTEGER
  GENERATED ALWAYS AS (cantidad * precio) STORED;
```

`precio_referencia` se conserva como columna legacy de contexto; el flujo nuevo
no la usa para calcular nada. No se elimina (evita un DROP innecesario).

### 4.2 `043_pedidos_reserva.sql` (idempotente)

```sql
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_estado_check
  CHECK (estado IN ('pendiente','convertido','descartado',
                    'pendiente_pago','pagado','rechazado','expirado','pagado_tardio'));
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS expira_en TIMESTAMPTZ;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS mp_preference_id TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS stock_reservado BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pedidos_pendiente_pago_expira
  ON public.pedidos (expira_en) WHERE estado = 'pendiente_pago';
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_mp_payment_id_unique
  ON public.pedidos (mp_payment_id) WHERE mp_payment_id IS NOT NULL;
```

`stock_reservado` es la marca de verdad para `convertir`; `expira_en` no sirve
porque sobrevive a la expiración y `pagado_tardio` no tiene stock reservado.

---

## 5. Contrato de APIs

### 5.1 POST `/api/pedidos` (público)

Request:
```json
{
  "nombre_contacto": "…", "telefono_contacto": "…", "email_contacto": "…",
  "origen": "productos|catalogo", "origen_slug": "…|null",
  "entrega_codigo": "retiro|delivery_iquique|…",
  "direccion_entrega": "…|null",
  "items": [{ "producto_id": 1, "modalidad": "unidad|caja", "cantidad": 2 }]
}
```

- 400: falta nombre/teléfono/email; email sin `@`; ítems vacíos; modalidad
  inválida; cantidad no entera > 0; producto inexistente/inactivo; caja sin
  `precio_mayor > 0` o `cantcaja < 1`; opción de entrega inexistente o inactiva;
  `requiere_direccion` y dirección vacía.
- El servidor ignora `precio`, `subtotal`, `total` y `entrega_costo` enviados.
- 409: stock insuficiente. Body:
  `{ "error": "Stock insuficiente", "items": [{ "codigo", "disponible", "solicitado" }] }`.
  Nada se inserta ni se descuenta (rollback total).
- 201: pedido creado. Con flag `false`: `estado='pendiente'`, `stock_reservado=false`,
  `expira_en=null`. Con flag `true`: `estado='pendiente_pago'`,
  `stock_reservado=true`, `expira_en=now()+36h`.
- Cliente: match por teléfono normalizado (lógica actual); si no tiene email,
  se guarda; si ya tiene, no se sobrescribe.

### 5.2 GET `/api/entrega/opciones` (público)
`{ data: [{ codigo, nombre, costo, requiere_direccion, nota }] }`, solo activas,
ordenadas por `orden,nombre`. `dynamic='force-dynamic'`.

### 5.3 PATCH `/api/entrega/opciones/[codigo]` (admin)
Acepta `costo`, `activa`, `orden`, `requiere_direccion`, `nota`. 401 sin sesión,
403 si no es admin. Valida `costo >= 0`. No permite cambiar `codigo`.

### 5.4 GET `/api/cron/liberar-reservas`
Header `Authorization: Bearer <CRON_SECRET>`, comparación con
`crypto.timingSafeEqual`. 401 si falta/no coincide; 500 si `CRON_SECRET` no está
configurado. Responde `{ data: { liberados, unidades } }`.

---

## 6. Algoritmo de reserva (contrato)

1. Validar body y opción de entrega contra DB (fuera de transacción).
2. Resolver/crear cliente por teléfono (fuera de transacción, como hoy).
3. Leer productos por `id` desde DB: `codigo`, `detalle`, `prcventa`,
   `precio_mayor`, `cantcaja`, `saldo`, `activo`. Calcular:
   - unidad: `precio = round(prcventa)`, `unidades = cantidad`.
   - caja: `precio = precio_mayor`, `unidades = cantidad * cantcaja`.
   - `subtotal = cantidad * precio`.
4. `liberarReservasVencidas()` (solo flag `true`).
5. Transacción única (array `sql.transaction`):
   - por ítem: `UPDATE productos SET saldo = saldo - u WHERE id = $id AND saldo >= u RETURNING saldo`
     seguido de un guard CTE que fuerza error si el UPDATE no devolvió fila
     (`SELECT CASE WHEN EXISTS(...) THEN 1 ELSE 1/0 END`), de modo que la
     transacción entera haga rollback. No se puede "chequear después": un UPDATE
     con 0 filas no es error para el driver.
   - `UPDATE ubicaciones_bodega SET saldo = saldo - u, updated_at = NOW() WHERE codigo=$cod AND empresa_id=1`.
   - `INSERT pedidos (... estado, expira_en, stock_reservado, total ...)`.
   - `INSERT pedido_items (... modalidad, precio ...)`; `subtotal` es generado.
   - flag `false`: sin UPDATEs de stock; `estado='pendiente'`.
6. 409 si el guard falla; el catch distingue el error de stock del 500 genérico.

`total = Σ subtotal + opciones_entrega.costo` (costo leído de DB en el paso 1).

### 6.1 `liberarReservasVencidas()` — una sola sentencia

Contrato de la CTE (la implementación puede variar nombres, no la semántica):

```sql
WITH vencidos AS (
  UPDATE pedidos SET estado='expirado', stock_reservado=false
  WHERE estado='pendiente_pago' AND expira_en < NOW() AND stock_reservado = true
  RETURNING id
), devoluciones AS (
  SELECT pi.producto_id,
         SUM(pi.cantidad * CASE WHEN pi.modalidad='caja' THEN p.cantcaja ELSE 1 END)::int AS unidades
  FROM pedido_items pi
  JOIN vencidos v ON v.id = pi.pedido_id
  JOIN productos p ON p.id = pi.producto_id
  GROUP BY pi.producto_id
), prod AS (
  UPDATE productos p SET saldo = p.saldo + d.unidades
  FROM devoluciones d WHERE p.id = d.producto_id
  RETURNING p.id
), ub AS (
  UPDATE ubicaciones_bodega u SET saldo = u.saldo + d.unidades, updated_at = NOW()
  FROM devoluciones d JOIN productos p ON p.id = d.producto_id
  WHERE u.codigo = p.codigo AND u.empresa_id = p.empresa_id
  RETURNING u.id
)
SELECT (SELECT count(*) FROM vencidos) AS liberados,
       (SELECT COALESCE(sum(unidades),0) FROM devoluciones) AS unidades;
```

Concurrencia: dos llamadas simultáneas actualizan las mismas filas de `pedidos`;
la segunda bloquea, reevalúa el `WHERE` tras el commit de la primera y obtiene
0 filas en `vencidos` → `devoluciones` vacío → no devuelve stock dos veces. Al
ser una sola sentencia, no existe ventana entre marcar y devolver.

---

## 7. Sub-slices (≤200 líneas añadidas/modificadas cada uno)

Orden seguro; cada sub-slice deja el sistema funcionando con el flag en `false`.

| # | Sub-slice | Archivos | Líneas estimadas |
|---|---|---|---|
| 7a | Migración 042 + tabla/seed + GET/PATCH opciones + tests | migración, 2 rutas API, test | ~170 |
| 7b | Cálculo server-side de precios/subtotales/total + validaciones (sin tocar aún el flujo POST) | `lib/pedidos/precios.ts`, test | ~120 |
| 7c | Contexto y selector de modalidad (unidad/caja) + dos botones; dedupe por producto+modalidad | `CarritoContext`, `SelectorModalidad`, `BotonAgregarPedido`, páginas productos/catálogo | ~180 |
| 7d | Checkout: email, opción de entrega, dirección, costo y total; drawer actualizado | `CarritoGateModal`, `CarritoCheckoutForm`, `CarritoDrawer` | ~190 |
| 7e | POST/GET pedidos con email, entrega, total, precios server-side y `stock_reservado=false` (flag false) | `app/api/pedidos/route.ts`, tests | ~190 |
| 7f | UI staff de pedidos: estados, modalidad, subtotal, entrega, email, total; admin de costos de entrega en caja-config | 2 client_page, test | ~190 |
| 8a | Migración 043 + `liberarReservasVencidas()` + tests de idempotencia | migración, lib, test, MIGRATION_ORDER | ~160 |
| 8b | Reserva atómica en POST pedidos (flag true), 409 con detalle, guard CTE, cliente email | `app/api/pedidos/route.ts`, test | ~180 |
| 8c | Llamadas perezosas (POST ítem nota, lecturas públicas) + cron + vercel.json + flag | 5 archivos, ruta cron, tests | ~150 |
| 8d | `convertir` con `stock_reservado` + PATCH descartar seguro + tests | convertir, `[id]`, tests | ~140 |

**Dependencias:** 8a antes de 8b/c/d. 7a antes de 7d. 7b antes de 7e.
No se activa `tienda-pago-online=true` hasta 8d verificado contra la DB real.

---

## 8. Riesgos — checklist PBT-IA

### Race conditions
- **Último stock, dos pedidos simultáneos:** cada ítem usa
  `UPDATE ... WHERE saldo >= x` + guard que aborta la transacción. Uno recibe
  201 y el otro 409; nunca stock negativo ni pedido parcial.
- **Devolución concurrente:** CTE única; el segundo UPDATE no ve filas.
- **Reserva vs. nota manual:** ambos caminos compiten por la misma fila de
  `productos`; el que llega segundo ve el saldo ya descontado.
- **Doble devolución por doble cron/llamada perezosa:** `stock_reservado=false`
  + `estado='expirado'` en el mismo UPDATE; idempotente.

### Doble clic / reintentos
- El drawer mantiene guard `enviando` (ya existe).
- Riesgo residual: dos POST idénticos con stock suficiente crean dos pedidos.
  Mitigación mínima propuesta: `idempotency_key UUID` opcional enviada por el
  cliente y `UNIQUE` parcial; ante 23505 devolver el pedido existente. Se
  decide en Fase A: **incluir en 8b** (costo ~15 líneas) o aceptar el riesgo
  hasta Slice 9. Recomendación: incluirlo.
- Webhook MP: fuera de alcance aquí; Slice 10 lo hace idempotente.

### Totales manipulados
- El cliente solo envía `producto_id`, `modalidad` y `cantidad`.
- Servidor ignora cualquier precio/total entrante.
- `total` y `entrega_costo` se recalculan desde DB.
- `pedido_items.codigo/detalle` se toman de `productos`, no del body.
- Test explícito: body con `precio=1`, `total=1` → se guarda el precio real.

### Expiración concurrente
- Una sola sentencia CTE; no hay ventana marcar/devolver.
- `expira_en` se calcula en DB (`NOW() + INTERVAL '36 hours'`), no en Node.
- Llamada perezosa antes de reservar: libera primero, luego intenta descontar.
- Cron solo respaldo; con Hobby 1/día, la liberación efectiva es la perezosa.
- Fallo de liberación en lecturas públicas: se captura y loguea; no rompe el
  catálogo. En escrituras, el error se propaga (no reservar sobre stock sucio).

### Consistencia stock
- Se descuenta en `productos.saldo` y `ubicaciones_bodega.saldo` dentro de la
  misma transacción, igual que el flujo actual.
- `convertir` con `stock_reservado=true` NO descuenta ninguna de las dos tablas.
- Pedido `rechazado` (Slice 10) deberá devolver stock; contrato deja
  `stock_reservado` y la CTE reutilizable.
- `pagado_tardio`: no se devuelve automáticamente; revisión manual.

### Seguridad / validación
- Webhook/cron: secreto con comparación timing-safe.
- API admin de entrega valida rol admin.
- Nunca loguear `CRON_SECRET`, `DATABASE_URL` ni tokens MP.
- Dirección solo obligatoria si la opción lo exige (validado en servidor).

---

## 9. Fase B — tests que intentan romper el contrato

### Precios y validación (Slice 7)
1. Body con `precio`, `subtotal`, `total` y `entrega_costo` falsos → 201 y en DB
   los valores reales de `productos`/`opciones_entrega`.
2. `modalidad='caja'` con `precio_mayor=NULL` → 400, sin SQL de escritura.
3. `modalidad='caja'` con `cantcaja=0` → 400.
4. Caja: `cantidad=2`, `cantcaja=6` → reserva/descuenta 12 unidades, subtotal
   `2 * precio_mayor`.
5. `entrega_codigo` inexistente o `activa=false` → 400.
6. `delivery_iquique` sin `direccion_entrega` → 400.
7. `retiro` con dirección vacía → 201 (no la exige).
8. Email vacío o sin `@` → 400.
9. Teléfono existente sin email → se actualiza `clientes.email`.
10. Teléfono existente con email → NO se sobrescribe.
11. `total = Σ subtotales + costo entrega` calculado en servidor.

### Reserva (Slice 8)
12. Flag `false` → `estado='pendiente'`, `expira_en=null`, `stock_reservado=false`,
    stock intacto.
13. Flag `true` → `estado='pendiente_pago'`, `expira_en ≈ now()+36h`,
    `stock_reservado=true`, stock descontado.
14. Dos pedidos simultáneos por el último stock → uno 201, uno 409.
15. Pedido multi-ítem donde el segundo no alcanza → rollback total: sin pedido,
    sin descuento del primero, 409 con detalle del ítem.
16. 409 incluye `codigo`, `disponible`, `solicitado`.
17. Fallo del INSERT de ítem → rollback del stock (no queda reserva huérfana).
18. `liberarReservasVencidas()` dos veces → la segunda devuelve stock 0.
19. Solo libera `pendiente_pago` con `expira_en < now()`; no toca `pendiente`,
    `pagado` ni `pagado_tardio`.
20. La devolución suma unidades correctas para caja (`cantidad * cantcaja`).
21. Devuelve en `productos` y `ubicaciones_bodega`.
22. POST ítem de nota dispara liberación antes de descontar (orden de llamadas).
23. GET público de productos/catálogo dispara liberación; si falla, responde
    igual (catch).
24. Cron sin header o con secreto incorrecto → 401; correcto → libera.
25. Concurrencia simulada de dos liberaciones → una sola devolución.

### Convertir (contrato preparado)
26. Pedido `pagado` con `stock_reservado=true` → crea nota SIN segundo descuento.
27. Pedido `pendiente` legacy → descuenta como hoy.
28. Pedido `expirado`/`rechazado` → 409 (no convertir).
29. Ítems de la nota conservan `modalidad` y precio.

### UI
30. Carrito mixto muestra unidad y caja del mismo producto como líneas distintas.
31. Cambiar modalidad no mezcla cantidades.
32. Botón caja deshabilitado/oculto si no hay `precio_mayor` o `cantcaja<=0`.
33. Checkout bloquea envío sin email/entrega/dirección requerida.
34. Doble clic en "Enviar pedido" solo produce un POST.
35. Total mostrado = subtotales + costo de entrega.

### Regresión
36. `__tests__/api/pedidos.test.ts`, `pedidos-id`, `pedidos-convertir`,
    `notas-venta-items-post-stock`, `client_page` de pedidos actualizados.
37. `slice-00-schema.test.ts` y `productos-precio-mayor.test.ts` apuntan a 043.

---

## 10. Verificación

```bash
# 1. Estructura y orden de migraciones
npm run test -- __tests__/slice-00-schema.test.ts

# 2. Typecheck / lint / suite completa
npx tsc --noEmit
npm run lint
npm run test

# 3. Aplicar migraciones a la DB real (branch production, sin pedidos)
npm run migrate

# 4. Verificar schema aplicado (psql o Neon SQL editor)
#   SELECT column_name, data_type, is_nullable FROM information_schema.columns
#    WHERE table_name='pedidos' ORDER BY ordinal_position;
#   SELECT * FROM opciones_entrega ORDER BY orden;
#   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
#    WHERE conrelid='pedidos'::regclass;
#   SELECT indexname FROM pg_indexes WHERE tablename='pedidos';

# 5. Build de producción
npm run build
```

Checklist manual antes de activar `tienda-pago-online`:
- [ ] 042 y 043 aplicadas y verificadas contra la base real.
- [ ] `CRON_SECRET` configurado en Vercel y `.env.local`.
- [ ] Prueba de dos pedidos concurrentes contra DB real (no solo mock).
- [ ] Prueba de liberación con un pedido vencido real y doble llamada.
- [ ] Convertir un pedido reservado no altera `productos.saldo`.

## 11. Fuera de alcance (slices 9–10)

- Crear preferencia MP, `expires=true`, `expiration_date_to`, `back_urls`.
- Webhook firmado, pago aprobado/rechazado, cobro en Caja Mayor.
- Creación automática de nota y `pagado_tardio`.
- Reembolsos.
