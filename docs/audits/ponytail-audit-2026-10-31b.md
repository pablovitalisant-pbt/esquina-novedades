# Ponytail audit — 2026-10-31b (Señal 2)

Solo lista; no se aplicó nada, no se commiteó nada. Alcance: `git diff c20d956..HEAD`
(lim3, A17 `lib/api-pagos`, A18 `lib/api-notas`, BUG-007, iconos, A19 `mockFlags`,
textos-kardex) y vecindad inmediata. Severidad: **alta / media / baja**.

"Sin lectores" = 0 coincidencias en grep sobre código y tests.

## Hallazgos del diff (mayor recorte primero)

1. `shrink` **baja — `empresaSlug` quedó a medio borrar en lim3.** lim3 eliminó el
   prop de `ImageWithFallback`, pero las interfaces siguen exigiéndolo y varios
   consumidores lo siguen pasando sin usarlo:
   - `components/ProductCard.tsx:14` (interface) — el componente ya no lo desestructura.
   - `components/BodegaCard.tsx:8` (interface) — ídem.
   - `components/TiendaPortada.tsx:26,29,36` (`Props`, firma pública e inner).
   - Call sites: `app/(app)/precios/client_page.tsx:363`,
     `app/(app)/bodega/client_page.tsx:30,135`, `app/page.tsx:49,59`.
   - Tests que aún lo pasan (no fallan porque el prop sigue en la interfaz):
     `__tests__/portada-auto-render.test.tsx:39`, `components/__tests__/ProductCard.test.tsx:35,82`,
     `__tests__/precio-mayorista-ui.test.tsx:20`, `__tests__/precios-card-badge.test.tsx:30`,
     `__tests__/ProductCard-prenota.test.tsx:40,55`, `__tests__/slice2b-precios-ui.test.tsx:104`,
     `__tests__/slice5-textos-por-mayor-menor.test.tsx:61`.
   - `__tests__/slice20-precios-smoke.test.ts:42-45` y `slice22-bodega-smoke.test.ts:45`
     **exigen** que `ProductCard`/bodega sigan aceptando `empresaSlug`: hay que
     actualizar esos guards junto con el prop.
   Reemplazo: quitar el prop de las 3 interfaces y de todos los call sites/tests.
   (-~20 código + ~10 test; 10 archivos; propuesta mecánica, sin riesgo)

2. `shrink` **media — opciones que solo preservan una divergencia vieja.**
   - `lib/api-notas.ts:17,24`: `verificarOk` (solo el POS lo pasa; el modal no).
   - `lib/api-pagos.ts:18,21`: `soloSiOk` (solo el POS lo pasa).
   Son dos booleanos por caller que obligan a mantener dos ramas y un parámetro
   extra en la firma. Reemplazo: unificar comportamiento (siempre lanzar / siempre
   `[]`) y borrar las opciones y los argumentos en `components/PagarNotaDialog.tsx:42`,
   `components/PosCobrarDialog.tsx:72`, `app/(app)/pos/client_page.tsx:231`,
   `components/AgregarANotaVentaModal.tsx:75`. (-~6 líneas, -2 flags de API)

3. `risk` **media — `crearNota` devuelve el string `"undefined"` y un test lo fija.**
   `lib/api-notas.ts:24-26`: con `verificarOk=false` (modal) una respuesta no-ok
   pasa igual a `res.json()` y retorna `String(data.id)` → `"undefined"`. El modal
   luego postea a `/api/notas-venta/undefined/items` y recién ahí muestra un error
   confuso. `__tests__/lib/api-notas.test.ts:48-52` **asserta** ese comportamiento
   (`resolves.toBe('undefined')`). Se corrige con el hallazgo 2 (lanzar siempre en
   `!res.ok`); ese test cambia a `rejects.toBeInstanceOf(ErrorNota)`. (-4 líneas de
   rama, evita una llamada inválida)

4. `shrink` **baja — dos clases de error idénticas.** `lib/api-notas.ts:4-9` y
   `lib/api-pagos.ts:5-11` (`ErrorNota` / `ErrorPago`) son el mismo código con otro
   nombre. Opcional: una `ErrorApi` en uno de los dos archivos y reexportar.
   (-~10 líneas; solo si se toca alguno de los dos helpers, no vale un slice propio)

5. `shrink` **baja — JSX comentado para "ocultar" Kardex.** `components/BottomNav.tsx:106-108`
   y `components/TopNav.tsx:98-100`: bloques de comentario con el `sheetLink`/`<Link>`
   listos para reactivar. Es código muerto en comentario; la reactivación ya está en
   PRD/BACKLOG. Reemplazo: borrar los comentarios (la ruta sigue existiendo). (-6)

6. `test` **baja — A19 cambió el default de 2 suites sin override.** El helper
   (`__tests__/helpers/mockFlags.ts`) está bien y las 45 suites migradas compilan,
   pero `__tests__/precios-eliminar-producto-ui.test.tsx:19` y
   `app/(app)/precios/client_page.test.tsx:7` usan `mockFlags({})`: antes mockeaban
   `{}` (todos los flags falsos), ahora heredan el JSON real (casi todos `true`).
   Verificar que las ramas que creían cubrir con flags apagados sigan ejercitadas.
   Además `jest.config.js:16` ignora `/__tests__/helpers/` y no hay archivos test
   ahí: inofensivo pero innecesario hoy.

## Puntos detectados por el DT en producción (ubicación y causa)

- **P1. Caja Mayor: "EMP." muestra "BN" y Cliente sale "—" con `cliente_id` presente.**
  - Columna Emp.: literal `BN` en `app/(app)/caja-mayor/client_page.tsx:1115`
    (badge si `item.data.empresa` es truthy) y `:1234` (badge fijo en la tabla de
    notas). El header es `:1026`. Causa: herencia de Bazar Naty; el valor real es
    `EMPRESA.slug` (`la-esquina-de-las-novedades`). `lib/empresa.ts` no tiene
    abreviatura. Propuesta: agregar `abreviatura: 'LE'` a `EMPRESA` y usarla en
    ambos badges (o eliminar la columna: single-tenant, el origen nunca varía).
  - Columna Cliente: `app/(app)/caja-mayor/client_page.tsx:1113` usa solo
    `item.data.nombre_cliente || "—"`. `app/api/caja/movimientos/route.ts:43,53`
    selecciona `m.nombre_cliente` **sin unir `clientes`**. Los cobros creados por
    `app/api/notas-venta/[id]/pagar/route.ts:125-126` copian
    `nota.nombre_cliente`, que es null en notas creadas sin snapshot de nombre
    (POS con `cliente_id`), aunque `m.kcodcli2` (UUID, migración 030) sí apunta al
    cliente. Propuesta: `LEFT JOIN public.clientes c ON c.id = m.kcodcli2` y
    `COALESCE(m.nombre_cliente, c.nombre)` (mismo cambio en
    `app/api/caja/export/route.ts:28` para el Excel). ~8 líneas, 3 archivos.
- **P2. Tienda: "1 artículos" en el carrito.** `components/tienda/TiendaHeader.tsx:57`:
  `aria-label={`Carrito, ${totalItems} artículos`}` sin caso singular (el badge
  visible solo muestra el número). Propuesta: singular/plural en la plantilla
  (`totalItems === 1 ? 'artículo' : 'artículos'`); `lib/utils.ts:8-12` ya resuelve
  el mismo problema para "ítem". ~1 línea.
- **P3. PosCobrarDialog: cuenta por defecto = primera (Mercado Pago) con forma EFECTIVO.**
  `components/PosCobrarDialog.tsx:41` (`forma` inicia en `'efectivo'`) y `:74`
  (`setCuentaId(... : lista[0]?.id ?? 0)`), con la lista ordenada por `orden`
  (`app/api/caja/cuentas/route.ts:24`), donde Mercado Pago va primero. Cambiar la
  forma en `:250-253` no reevalúa la cuenta. Propuesta: sin predeterminada guardada,
  elegir la cuenta cuyo nombre corresponda a la forma (efectivo → caja/efectivo) o
  dejar `cuentaId=0` para forzar selección (ya existe el error en `:91`). ~3 líneas.
- **P4. "Nuevo producto" (Lista de Precios): 5 MB y sin `lib/imagen-reducir`.**
  `app/(app)/precios/client_page.tsx:288-289` valida `5 * 1024 * 1024` y `:298`
  anuncia "Máximo 5 MB"; `:145-151` manda el archivo tal cual con `FileReader`
  a base64. `ProductDrawer.tsx:21,138-160` usa `reducirImagen` y `MAX_ENTRADA_BYTES`.
  El servidor tiene tope duro de 3 MB base64 (`lib/imagen-reducir.ts:11`) y
  `app/api/productos/upload/route.ts`, así que un archivo de 4–5 MB pasa el cliente
  y falla con el warning "la imagen no se pudo subir". Propuesta: reutilizar
  `reducirImagen` + `TIPOS_ACEPTADOS` igual que el drawer. ~10 líneas + 1 test.
- **P5. Pedidos online con `origen='productos'`.** `components/TiendaPortada.tsx:31`
  pasa `origen="productos"` al `CarritoProvider`; el enum está tipado en
  `contexts/CarritoContext.tsx:25,96`, validado en `app/api/pedidos/route.ts:135-137`
  y restringido por `migrations/034_pedidos.sql:18` (`CHECK ... IN ('productos','catalogo')`).
  Causa: la tienda reutiliza el origen `productos` (pensado para la vitrina) y solo
  el catálogo impreso usa `catalogo`; no existe valor para "tienda online". La UI de
  pedidos ni siquiera muestra `origen` (`app/(app)/pedidos/client_page.tsx:24`), así
  que el impacto es en DB/reportes. Si el DT quiere distinguirlo, requiere widening
  del `CHECK` + migración nueva, tipo `Origen`, validación de API y reportes
  (~15 líneas + 1 migración). Es decisión de producto.

## Recomendación final

**Next slice — P1 a P5 + hallazgo 1 (mecánico, comparte archivos con P4):**

- P1 (~8), P2 (1), P3 (~3), P4 (~10 + test), P5 según decisión (0 si solo etiqueta;
  ~15 + migración si se agrega origen `tienda`).
- Hallazgo 1 (borrar `empresaSlug` muerto, ~30 líneas) entra aquí porque P4 ya edita
  `precios/client_page.tsx` y el resto es quitar una prop de 6 call sites + guards.
- Neto estimado: **~+10/−30 líneas**, sin DB salvo P5, riesgo bajo-medio (P1 toca
  caja/lectura, P3 y P4 cobro/alta).

**Backlog:**

- Hallazgos **2 y 3** juntos (unificar `verificarOk`/`soloSiOk` y corregir el
  `"undefined"`): toca el camino de cobro, merece ciclo propio con sus tests.
- Hallazgo **4** (`ErrorApi`): cosmético, solo al tocar esos helpers.
- Hallazgo **5** (comentarios Kardex): cosmético.
- Hallazgo **6** (revisar las 2 suites con `mockFlags({})`): test-only, por tandas.
- P5 si el DT decide que `productos` es suficiente: no hacer nada (0 líneas).
