# Slices 4, 5 y 6 — Modelo mayorista/detalle — Fase A (Contrato)

Fuente: PRD §8.2, §8.3, §9 filas 4-6, §10, Zonas de riesgo. BUGS.md del proyecto: solo BUG-001 (jest/prod, no toca estos archivos). `docs/referencia-bazar-naty/BUGS.md`: sin entradas de los archivos listados abajo que cambien el diseno (revisar `notas-venta/[id]` antes de 5c, es el archivo mas fragil: 1035 lineas). Solo documento; no se escribio codigo.

## 0. Diseno (Director Tecnico) + evidencia en el codigo

Diseno aplicado tal cual. Hallazgos que NO lo invalidan pero que el diseno no cubria y entran al alcance:

| # | Evidencia | Consecuencia |
|---|---|---|
| H1 | `app/api/productos/[id]/route.ts:158-160`: PUT con `prcventa` ejecuta `UPDATE prenota_items SET precio = prcventa` sobre TODOS los items de notas activas sin pagos | Tras Slice 5 pisaria el precio por caja de items `modalidad='caja'` con el precio unitario (30000 -> 2500). Fix: `AND modalidad='unidad'` y propagar `precio_mayor` solo a `modalidad='caja'` (5b). Test existente `productos-put-propagacion.test.ts` assert sobre el texto de la query: se actualiza |
| H2 | `scripts/migrations-order.ts` + `__tests__/slice-00-schema.test.ts:104`: `expect(i('039')).toBe(MIGRATION_ORDER.length - 1)` | Agregar 040 rompe ese test. Se cambia a la ultima migracion en 4a y 5a (no es editar una migracion aplicada) |
| H3 | `scripts/apply-migrations.ts:12-40`: `npm run migrate` reaplica TODO MIGRATION_ORDER cada vez | 040/041 deben ser idempotentes de verdad (ya exigido) |
| H4 | `notas-venta/[id]/client_page.tsx:153`: `item.unidades / item.cajas` | Si un item tuviera `cajas=0` da `Infinity/NaN`. Se guarda la division (5c). Semantica propuesta: `unidad` conserva el comportamiento actual (cajas informativo, `agregarProducto` manda cajas:1/unidades:cantcaja, precio por unidad); `caja`: `unidades` SIEMPRE derivada en servidor, UI solo edita `cajas` |
| H5 | `notas-venta/[id]/items/route.ts:55-60` y `[itemId]/route.ts:50-53`: el servidor confia en `unidades`/`cajas`/`precio` del cliente sin validar contra producto | Para `caja` el servidor ignora `unidades` del body y calcula `cajas * productos.cantcaja` (POST) o `cajas * (item.unidades/item.cajas)` (PATCH, congela la razon al momento de la venta aunque `cantcaja` cambie despues) |
| H6 | `pedidos/[id]/convertir/route.ts:106`: INSERT sin `modalidad`; `precio_referencia` es precio por UNIDAD (`CarritoContext.tsx:12`, `CarritoDrawer.tsx:31`) | Con `DEFAULT 'unidad'` queda correcto sin tocar el archivo: no se modifica en Slice 5. Slice 7 deberá setear `modalidad`/precio por caja ahi. Se agrega test de regresion (no se toca el INSERT) |
| H7 | `app/api/clientes/route.ts:44-56`: `LIMIT 50` y dos queries duplicadas (con/sin `q`) | El filtro por etiqueta debe ser server-side (si fuera en cliente solo filtraria 50). Se unifica en una query (6a) |
| H8 | `prenotas.estado` solo admite `'activa'\|'anulada'` (migracion 022) | "Notas activas" = `estado='activa'` |
| H9 | `caja-mayor/client_page.tsx` y `deudores/client_page.tsx` NO calculan `unidades*precio`; los totales vienen de las APIs | El diseno decia "caja-mayor/client pages": el unico client page con calculo propio es `notas-venta/[id]/client_page.tsx` (6 sitios). Linea 564 esta invertida (`precio * unidades`): un grep ingenuo la pierde |
| H10 | `precio_mayor=0` | Diseno dice `>= 0`; el gate de caja es `IS NOT NULL` (0 permitido = caja regalada). Se respeta el diseno; se anota para el PO |

Sin cambios de DB en Slice 6 (etiqueta derivada; sin columna ni indice nuevo: `idx_prenotas_estado` existe, volumen bajo).

## 1. Orden y feature flags (`config/feature-flags.json`, nuevos en `false`)

Orden: 4a -> 4b -> 4c -> 5a -> 5b -> 5c -> 5d -> 5e -> 5f -> 6a -> 6b. Cada sub-slice <= 200 lineas anadidas/modificadas (codigo + tests), PBT-IA completo y pregunta de commit al cerrar cada uno.

Flags: `precio-mayorista-ui` (4c: muestra/edita precio_mayor), `notas-venta-modalidad` (5e: selector Unidad/Caja y badge de tipo), `clientes-etiqueta` (6b: badge + filtro). APIs validan siempre (un cliente con flag off no puede crear items `caja` sin `precio_mayor`). 5a (reemplazo por `subtotal`) NO va tras flag: es identico para filas `unidad` y se prueba por equivalencia.

Regla dura de despliegue: aplicar 040 y 041 con `npm run migrate` contra `steep-shape-55022986` / `production`, verificar con consulta real (seccion 6) ANTES de desplegar codigo de 4b/5a (las queries leeran `precio_mayor` y `subtotal`; sin la columna, todas las rutas de notas/caja devuelven 500). Produccion solo tiene seed (sin notas): `ADD COLUMN ... GENERATED STORED` reescribe tabla vacia, sin riesgo.

## 2. SLICE 4 — Precio mayorista por caja

### Migracion 040 (`migrations/040_productos_precio_mayor.sql`)
```sql
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS precio_mayor INTEGER NULL
    CHECK (precio_mayor IS NULL OR precio_mayor >= 0);
```
(el CHECK inline solo se crea si la columna se crea; idempotente.)

### 4a — Schema + tipos (~30 lineas)
| Archivo | Cambio |
|---|---|
| `migrations/040_productos_precio_mayor.sql` (nuevo) | arriba |
| `scripts/migrations-order.ts` | `'040_productos_precio_mayor.sql'` al final |
| `__tests__/slice-00-schema.test.ts:104` | `'039'` -> `'040'` (ultima) |
| `types/index.ts` (`Producto`) | `precio_mayor: number \| null` (opcional `?` para no romper fixtures de tests existentes: se verifica con `tsc`) |

### 4b — APIs de productos (~70 lineas)
| Archivo | Cambio |
|---|---|
| `app/api/productos/[id]/route.ts` | `precio_mayor` a `WHITELIST`; validacion: `null` OK, si no `Number.isInteger(Number(v)) && >= 0` y no boolean/string vacia (`esNumeroValido` rechaza null, por eso rama aparte). `RETURNING *` ya lo devuelve. Propagacion a items: va en 5b (no existe `modalidad` aun) |
| `app/api/productos/route.ts` | POST: validar y insertar `precio_mayor` (default null); GET agregado: `MAX(p.precio_mayor) AS precio_mayor` (query en `:94-115`; sin esto /precios no lo recibe) |

### 4c — UI (~80 lineas, tras flag `precio-mayorista-ui`)
| Archivo | Cambio |
|---|---|
| `components/ProductDrawer.tsx` | estado `editPrecioMayor` (init en `:99/:117`), input "Precio por caja" en el form de edicion, enviar `body.precio_mayor` (`''` -> `null`; ojo: el patron actual `if (x) body.x` NO sirve para borrar; aqui se manda siempre), fila "Precio por caja" junto a "Precio venta" (`:525`) cuando no es null |
| `components/ProductCard.tsx` | bajo el precio detalle (`:75`) texto "Caja: $X" cuando `precio_mayor != null` y no `ocultarPrecios` |
| `app/(app)/precios/client_page.tsx` | `crearPrecioMayor` en el dialogo "Nuevo producto" (`:208-260`) y en el POST (`:121-131`) |
| `config/feature-flags.json` | `"precio-mayorista-ui": false` |

Impacto lateral Slice 4 — archivos existentes que NO cambian: `catalogos/public/[slug]` y `app/productos|page.tsx` (tienda publica: el carrito con modalidad es Slice 7), `admin/productos-lista`, `bodega/*`, `ingresos`, `conciliaciones` (leen `cantcaja`/`saldo`, no precio), `cambiar-codigo` (no toca precios). `productos/[id]/eliminar` hace soft-delete, sin columnas nuevas. Tests existentes a ajustar: `productos-put-validacion`, `productos-post-stock-minimo`, `productos-crear-smoke` (solo si hacen `toEqual` exacto sobre el INSERT; se verifica en Fase B), `precios-card-badge`.

## 3. SLICE 5 — Modalidad unidad/caja en notas + tipo derivado

### Migracion 041 (`migrations/041_prenota_items_modalidad_subtotal.sql`)
```sql
ALTER TABLE public.prenota_items
  ADD COLUMN IF NOT EXISTS modalidad TEXT NOT NULL DEFAULT 'unidad'
    CHECK (modalidad IN ('unidad','caja'));
ALTER TABLE public.prenota_items
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14,2)
    GENERATED ALWAYS AS (CASE WHEN modalidad = 'caja' THEN cajas * precio ELSE unidades * precio END) STORED;
```
Notas: `cajas/unidades/precio` son nullables (002) -> `subtotal` NULL igual que hoy `unidades*precio` NULL; `SUM` los ignora, mismo resultado. `subtotal` no se puede escribir en INSERT/UPDATE (ningun INSERT/UPDATE actual lo nombra; `INSERT ... RETURNING *` lo devuelve como string numeric: leer con `Number()`). Orden: debe ir despues de 040 (solo por numeracion).

### 5a — Schema + totales servidor (~70 lineas)
| Archivo | Cambio |
|---|---|
| `migrations/041_...sql` (nuevo), `scripts/migrations-order.ts`, `__tests__/slice-00-schema.test.ts:104` (`'041'`) | arriba |
| SQL `SUM(pi.unidades * pi.precio)` -> `SUM(pi.subtotal)` (8 sitios) | `app/api/notas-venta/route.ts:25`; `app/api/deudores/route.ts:27`; `app/api/notas-venta/[id]/pagar/route.ts:64`; `app/api/notas-venta/[id]/aplicar-saldo-favor/route.ts:71`; `app/api/caja/nota-busqueda/route.ts:40`; `app/api/caja/notas/[kcodcli2]/route.ts:34`; `app/api/caja/resumen/[kcodcli2]/route.ts:37`; `app/api/caja/movimientos/[id]/notas/route.ts:83` |
| JS servidor (1 sitio) | `app/api/notas-venta/[id]/route.ts:54` -> `sum + Number(i.subtotal)` (con `?? 0` si NULL) |

Total reemplazos del diseno: 15 = 8 SQL + 1 JS servidor + 6 JS cliente (los 6 en 5c).

### 5b — API de items + propagacion de precios (~100 lineas)
| Archivo | Cambio |
|---|---|
| `app/api/notas-venta/[id]/items/route.ts` | aceptar `modalidad` (default `'unidad'`; otro valor -> 400). Si `caja`: leer `productos` (`cantcaja`, `precio_mayor`) por `codigo+empresa_id`; 400 si `precio_mayor IS NULL` o `cantcaja < 1`; `cajas` entero >= 1; `unidades = cajas * cantcaja` (ignora `unidades` del body); stock se descuenta con `unidades` como hoy (UPDATE atomico `saldo >= x` sin cambios). INSERT incluye `modalidad`. Idempotencia por `id` intacta (`:41-48` devuelve fila existente) |
| `app/api/notas-venta/[id]/items/[itemId]/route.ts` | `SELECT` agrega `modalidad`; si `caja`: `unidades = cajas * (item.unidades / item.cajas)` (entero; si `item.cajas` es 0 -> 422) y el delta de stock se calcula con esa `unidades`; `modalidad` inmutable (PATCH que la mande distinta -> 400; cambiar = borrar y re-agregar). `unidad` sin cambios (BUG-053 parcial se conserva) |
| `app/api/productos/[id]/route.ts` | propagacion `:158-176`: `precio = prcventa` solo `WHERE ... AND modalidad='unidad'`; nuevo: si `precio_mayor` viene y no es null, `UPDATE prenota_items SET precio = precio_mayor WHERE modalidad='caja'` con el mismo guard de notas activas sin pagos |
| `__tests__/api/productos-put-propagacion.test.ts`, `notas-venta-items-*-stock.test.ts` | ajustar a las queries nuevas |

### 5c — Detalle de nota: totales y edicion (~120 lineas)
`app/(app)/notas-venta/[id]/client_page.tsx` (+ su `client_page.test.tsx`):
- Totales JS -> `Number(item.subtotal)`: `:137` (fila), `:453` (Excel `'Total'`), `:564` (PDF, invertido), `:619` (PDF total), `:706` (WhatsApp legacy), `:917` (total de cabecera).
- Fila: columna/etiqueta de modalidad; encabezado "Precio unitario" -> "Precio" con sufijo "/u" o "/caja" por fila.
- Edicion (`:55-85`, `:140-175`): item `caja` -> solo `cajas` editable, `unidades` solo lectura (`cajas * unidades/cajas` previo), `precio` por caja; guard H4 contra `cajas=0`; PATCH no envia `unidades` para `caja`.
- `fetchPrenota` ya trae `SELECT *` -> `modalidad` y `subtotal` llegan sin tocar `[id]/route.ts` GET (solo `tipo`, en 5f).

### 5d — PDF / Excel / WhatsApp (~80 lineas)
Mismo archivo: PDF (`:540-600`) columna "Modalidad" + subtotal; Excel `toRows` agrega `'Modalidad'` y `'Total'` = subtotal; WhatsApp (`:700-715` y rama con PDF) linea con "(3 cajas x $10.000)" vs "(12 uds x $2.500)" y subtotal. Linea de tipo de nota en el encabezado (usa `tipo` de 5f; si falta, se deriva localmente de `items`).

### 5e — Agregar item con selector (~90 lineas, tras flag `notas-venta-modalidad`)
| Archivo | Cambio |
|---|---|
| `components/AgregarANotaVentaModal.tsx` | prop `producto` suma `precio_mayor`; selector Unidad/Caja (Caja deshabilitado si `precio_mayor == null \|\| cantcaja <= 0`); precio default `prcventa` o `precio_mayor`; texto "N unidades" solo en caja; body con `modalidad` (`unidades = cajas*cantcaja` solo informativo, el servidor recalcula) |
| `app/(app)/notas-venta/[id]/client_page.tsx` `agregarProducto` (`:386-405`) | mantiene alta rapida en `unidad` (comportamiento actual) y manda `modalidad:'unidad'`; el cambio a caja se hace con el selector del modal. Si el PO prefiere selector tambien aqui, es sub-slice aparte |
| `components/ProductCard.tsx` | pasar `precio_mayor` al modal (ya recibe `producto` completo) |
| `config/feature-flags.json` | `"notas-venta-modalidad": false` |

### 5f — Tipo derivado en lista y detalle (~60 lineas)
Tipo = `NULL` sin items; todos `caja` -> `'mayor'`; todos `unidad` -> `'menor'`; ambos -> `'mixta'`.
| Archivo | Cambio |
|---|---|
| `app/api/notas-venta/route.ts` | subquery `CASE WHEN COUNT(*)=0 THEN NULL WHEN BOOL_AND(modalidad='caja') THEN 'mayor' WHEN BOOL_AND(modalidad='unidad') THEN 'menor' ELSE 'mixta' END AS tipo` (misma query que ya hace el `SUM`) |
| `app/api/notas-venta/[id]/route.ts` GET | `tipo` calculado en JS desde `items` (ya se leen) |
| `app/(app)/notas-venta/client_page.tsx` | `Prenota.tipo?`, `Badge` en la fila (tras flag) |

Impacto lateral Slice 5 (revision completa):
- **pedidos -> convertir** (`pedidos/[id]/convertir/route.ts:106`): sin cambio (H6). Test regresion: INSERT no nombra `modalidad` y el default produce `unidad`.
- **reembolsar / anular / DELETE item** (`reembolsar/route.ts:112-116`, `[id]/route.ts:192-196`, `[itemId]/route.ts:155-160`, `items/[itemId]/route.ts:56-59`): restauran `SUM(unidades)` -> correctos mientras `unidades` se guarde SIEMPRE en unidades (H5). Sin cambio; test: nota con 3 cajas de cantcaja 12 restaura 36.
- **Exportes**: `caja/export` y `caja/cierres` usan `caja_movimientos`, no items -> sin cambio. Exportes de nota = 5d.
- **Tipos compartidos**: `Prenota` local en `notas-venta/client_page.tsx` (`tipo?`); items de `[id]/client_page.tsx` son `any` (sin tipo compartido); `types/index.ts` no define PrenotaItem -> no se agrega (YAGNI).
- **Schema/migraciones**: 041 + `migrations-order.ts` + test H2. `slice35a-schema-prenotas`, `slice-00-schema` revisar. `productos/[id]/cambiar-codigo` UPDATE solo `codigo` -> sin cambio.
- **Middleware/permisos/env**: sin cambios (mismas reglas `bodeguero` 403). **Flags**: arriba. **Seed** (`slice-00-seed`): no inserta items.
- Tests existentes con totales: `notas-venta-api-totales`, `deudores`, `slice32-pagar-nota`, `aplicar-saldo-favor`, `notas-venta-exportar-pdf`, `notas-venta-compartir-whatsapp`, `notas-venta-guardar-item`, `[id]/client_page.test.tsx` (mocks con `{unidades, precio}` sin `subtotal`: actualizar fixtures a incluir `subtotal`).

## 4. SLICE 6 — Etiqueta de cliente derivada

### 6a — API (~70 lineas)
`app/api/clientes/route.ts` GET: unificar las dos queries (`:23-56`) en una con `($q::text IS NULL OR nombre ILIKE $q)` y columna
```sql
(SELECT CASE WHEN COUNT(*) = 0 THEN NULL
             WHEN BOOL_AND(pi.modalidad='caja') THEN 'mayorista'
             WHEN BOOL_AND(pi.modalidad='unidad') THEN 'minorista'
             ELSE 'ambos' END
 FROM public.prenotas p JOIN public.prenota_items pi ON pi.prenota_id = p.id
 WHERE p.cliente_id = clientes.id AND p.estado = 'activa') AS etiqueta
```
Parametro `?etiqueta=mayorista|minorista|ambos|sin` (whitelist; otro valor -> 400) aplicado sobre la columna ANTES del `LIMIT 50`. Sin cambio en `clientes/[id]/route.ts`.

### 6b — UI (~60 lineas, tras flag `clientes-etiqueta`)
`app/(app)/clientes/client_page.tsx`: `Cliente.etiqueta: string \| null`, `Badge` junto al nombre (`:140-150`), `<select>` de filtro que agrega `etiqueta` a la URL de `fetchClientes` (`:33-44`). `config/feature-flags.json`: `"clientes-etiqueta": false`. `AgregarANotaVentaModal` consume `/api/clientes?q=` y recibe el campo extra sin romperse (no se muestra).

Impacto lateral Slice 6: ninguno mas. `clientes-telefono-unico`, `clientes-saldo-favor`, `slice18-clientes-api`, `slice18b-*` mockean `sql` por orden de llamada: unificar las queries cambia el numero/orden de llamadas -> se ajustan en Fase B (riesgo conocido).

## 5. Riesgos (checklist PBT-IA)

| Riesgo | Mitigacion |
|---|---|
| Migracion no aplicada en Neon antes de deploy (BUG-063 Bazar Naty, PRD §10.1) | aplicar y verificar (seccion 6) antes de merge a main/deploy; 5a no entra a produccion sin 041 |
| Subtotal desalineado con `unidades*precio` en filas legacy | default `unidad` => formula identica; test de equivalencia |
| Unidades de caja inconsistentes (cantcaja cambia despues de vender) | razon `unidades/cajas` congelada en PATCH; `cantcaja` solo se lee al crear |
| `precio_mayor` cambia con items en notas abiertas | propagacion solo a notas activas sin pagos (mismo guard que prcventa) |
| PUT prcventa pisa precio caja (H1) | filtro `modalidad='unidad'` + test |
| Doble descuento de stock en reintento | idempotencia por `id` existente intacta; test con `caja` repetido |
| NaN/null bypass (hallazgo previo PBT-IA) | `precio_mayor`, `cajas`, `modalidad` validados con `Number.isInteger`, rechazo de boolean/string vacio/NaN/Infinity |
| Race anular/reembolsar vs PATCH | no se toca el `FOR UPDATE` de DELETE/anular; PATCH sigue sin lock (riesgo heredado, no nuevo) |
| `subtotal` llega como string | `Number()` en todo consumo JS; tests con string `"30000.00"` |
| Mocks de `sql` por orden de llamada | cada sub-slice ajusta sus tests; `npx jest` completo al cerrar |
| Zona fragil: `notas-venta/[id]/client_page.tsx` (1035 lineas, 6 tests dedicados) | 5c/5d separados, sin refactor, solo reemplazos puntuales |
| Secretos | no se loguea `DATABASE_URL`; `migrate` imprime solo nombres |
| `precio_mayor = 0` | permitido por diseno (H10); gate `IS NOT NULL` |

## 6. Tests que intentan romperlo (Fase B)

**Slice 4**
- PUT `precio_mayor`: `-1`, `1.5`, `"abc"`, `NaN`, `true`, `""`, `"1000"`(string numerica) -> 400 los invalidos; `null` y `0` y `10000` -> 200. POST igual. `precio_mayor` ausente en PUT no altera el valor existente.
- GET `/api/productos` incluye `precio_mayor` (null y numero). ProductDrawer: vaciar el input manda `null` (borra); flag off no muestra input; `ocultarPrecios` oculta "Caja: $X".

**Slice 5**
- Subtotal: 3 cajas a $10.000 con `cantcaja=12` => `subtotal=30000` (no 360000), `unidades=36`; 12 unidades a $2.500 => 30000; item caja y item unidad en la misma nota => total 60000.
- Nota mixta -> `tipo='mixta'`; solo cajas -> `'mayor'`; solo unidades -> `'menor'`; sin items -> `null`; borrar el unico item caja de una mixta la vuelve `'menor'`.
- POST `modalidad='caja'` con `precio_mayor` null -> 400 sin tocar stock (assert: ningun `UPDATE productos`); con `cantcaja=0` -> 400; `modalidad='otra'` -> 400; `cajas=0`, `1.5`, `-1` -> 400; `unidades` enviada por el cliente en caja se ignora (`cajas=3`, `unidades=1` => descuenta 36); stock insuficiente -> 400 con `disponible/solicitado`; reintento con mismo `id` no descuenta dos veces.
- PATCH caja: cambia `cajas` 3->5 => delta de stock 24 (con razon 12) y NO usa `cantcaja` actual del producto (cambiarlo a 6 antes del PATCH no altera); `cajas=0` -> 400; intento de cambiar `modalidad` -> 400; PATCH parcial de solo `precio` conserva `cajas/unidades` (BUG-053).
- H1: PUT `prcventa` NO modifica `precio` de items `caja`; PUT `precio_mayor` SI actualiza items `caja` de notas activas sin pagos y NO los de notas con pagos ni anuladas.
- Restauracion: anular, reembolsar y DELETE item de 3 cajas (cantcaja 12) restauran 36 unidades.
- Convertir pedido: INSERT sin `modalidad` => items `unidad`, total = unidades*precio_referencia igual que antes.
- **Ninguna suma usa unidades*precio**: test estatico (patron de los `*-smoke.test.ts`) que lee `app/**` y falla si encuentra `/unidades\)?\s*\*\s*(Number\()?[\w.]*precio|precio\)?\s*\*\s*(Number\()?[\w.]*unidades/` fuera de tests y migraciones; ademas verifica que los 8 SQL contienen `SUM(pi.subtotal)`.
- Equivalencia de totales: lista, detalle, pagar, aplicar-saldo-favor, deudores, caja (nota-busqueda, notas, resumen, movimientos/notas) devuelven el mismo total para la misma nota mixta (mock con `subtotal` string `"30000.00"`).
- UI modal: Caja deshabilitado sin `precio_mayor` o con `cantcaja<=0`; cambiar a Caja cambia precio default a `precio_mayor`; PDF/Excel/WhatsApp contienen modalidad y subtotal (30000), no `unidades*precio`.
- Migracion: 041 contiene `IF NOT EXISTS`, `CHECK (modalidad IN ('unidad','caja'))`, `GENERATED ALWAYS AS ... STORED`; `MIGRATION_ORDER` termina en 041; reaplicar dos veces no falla (en DB de prueba).

**Slice 6**
- Cliente sin notas -> `etiqueta` null; solo notas con caja -> `mayorista`; solo unidad -> `minorista`; una nota mixta o dos notas distintas -> `ambos`; nota anulada no cuenta (cliente con unica nota caja anulada -> null); filtro `?etiqueta=ambos` no devuelve otros; `?etiqueta=xxx` -> 400; `?etiqueta=sin` devuelve solo null; filtro se aplica antes del `LIMIT 50` (cliente 51 con etiqueta aparece); `q` + `etiqueta` combinados; inyeccion `?etiqueta='; DROP` -> 400.
- UI: badge por etiqueta; flag off no muestra badge ni select.

## 7. Comandos de verificacion

```
npx tsc --noEmit
npm run lint
npx jest                       # suite completa al cerrar cada sub-slice
npx jest __tests__/slice-00-schema.test.ts __tests__/api/productos-put-propagacion.test.ts __tests__/api/pedidos-convertir.test.ts
npm run build
# Migraciones (rama production, proyecto steep-shape-55022986):
npm run migrate                # idempotente; ejecutarlo 2 veces
# Verificacion contra la base real (antes de activar flags):
#   SELECT column_name, data_type, is_nullable, is_generated FROM information_schema.columns
#     WHERE table_name='prenota_items' AND column_name IN ('modalidad','subtotal');
#   SELECT column_name FROM information_schema.columns WHERE table_name='productos' AND column_name='precio_mayor';
#   SELECT COUNT(*) FROM prenota_items;   -- esperado 0 en produccion (solo seed)
# Guard anti unidades*precio (debe devolver 0 lineas):
grep -rnE "unidades\)? ?\* ?(Number\()?[A-Za-z_.]*precio|precio\)? ?\* ?(Number\()?[A-Za-z_.]*unidades" app components lib --include=*.ts --include=*.tsx | grep -v "\.test\."
```

## 8. Resumen de archivos

- Nuevos: `migrations/040_productos_precio_mayor.sql`, `migrations/041_prenota_items_modalidad_subtotal.sql`, tests de cada sub-slice.
- Modificados (existentes): `scripts/migrations-order.ts`, `__tests__/slice-00-schema.test.ts`, `types/index.ts`, `config/feature-flags.json`, `app/api/productos/route.ts`, `app/api/productos/[id]/route.ts`, `components/ProductDrawer.tsx`, `components/ProductCard.tsx`, `app/(app)/precios/client_page.tsx`, `components/AgregarANotaVentaModal.tsx`, `app/api/notas-venta/route.ts`, `app/api/notas-venta/[id]/route.ts`, `.../[id]/items/route.ts`, `.../[id]/items/[itemId]/route.ts`, `.../[id]/pagar/route.ts`, `.../[id]/aplicar-saldo-favor/route.ts`, `app/api/deudores/route.ts`, `app/api/caja/{nota-busqueda,notas/[kcodcli2],resumen/[kcodcli2],movimientos/[id]/notas}/route.ts`, `app/(app)/notas-venta/[id]/client_page.tsx`, `app/(app)/notas-venta/client_page.tsx`, `app/api/clientes/route.ts`, `app/(app)/clientes/client_page.tsx`, y los tests existentes listados.
- Sin cambio (con justificacion en secciones 2-4): `pedidos/[id]/convertir`, `reembolsar`, `cambiar-codigo`, `caja/export`, `caja/cierres`, `caja-mayor/client_page.tsx`, `deudores/client_page.tsx`, tienda publica y catalogos, middleware, env.

## 9. Preguntas abiertas para el PO (con default)

1. `precio_mayor = 0`: permitido (default, segun diseno). Si no, cambiar a `> 0` en 4b.
2. Alta rapida en `[id]/client_page.tsx` (`agregarProducto`): queda en `unidad` (default); la caja se elige en el modal.
3. Cambiar `modalidad` de un item existente: no se permite (borrar y re-agregar).
