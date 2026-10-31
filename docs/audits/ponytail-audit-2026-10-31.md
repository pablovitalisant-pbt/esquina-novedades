# Ponytail audit — 2026-10-31 (Señal 2)

Solo lista; no se aplicó nada, no se commiteó nada. Alcance pedido:
`git diff f60f876..HEAD` más vecindad inmediata de:

- portada automática: `components/tienda/portada-auto.ts`, `components/TiendaPortada.tsx`
- fotos: `lib/imagen-reducir.ts`, `lib/cloudinary-url.ts`, `lib/cloudinary.ts`,
  `components/ImageWithFallback.tsx`, `app/api/productos/upload/route.ts`,
  `components/ProductDrawer.tsx`
- POS: `app/(app)/pos/client_page.tsx`, `components/BottomNav.tsx`
- hook: `hooks/useBusquedaClientes.ts`
- flags: `config/feature-flags.json` (los que están en `true` y conservan rama muerta OFF)

"Sin lectores" = 0 coincidencias en grep sobre código **y** tests.
Los flags intencionales documentados en `29b` (`tienda-portada-v2`,
`tienda-mayor-online`, `tienda-pago-online`, `mp-webhook-ignorar-ipn-legacy`,
`pedido-confetti`, `notas-venta-modalidad`, `clientes-etiqueta`,
`precio-mayorista-ui`, `registro_notas_bodega_ui`, `env-validacion-arranque`)
no se proponen para borrado salvo donde se indica.

Contexto: la tanda son tres slices consecutivos (portada-auto, fotos-1, pos-stock)
cada uno con su flag apagado-y-activado en commits contiguos. Eso dejó las ramas
OFF sin ejecución real en producción y tres tests exclusivos de esas ramas.
No hay migración ni columna que borrar.

## Hallazgos (mayor recorte primero)

1. `shrink` **Flag `fotos-v1` (true, activado en `95251a9`): rama OFF muerta en
   `ImageWithFallback`.** `components/ImageWithFallback.tsx:33,39-42,50-51`:
   con el flag ON nunca se ejecuta la url adivinada `${empresaSlug}/${codigo}.jpeg`;
   el `if (error || (FOTOS_V1 && !src))` puede quedar como `if (error || !src)` y
   `imgSrc` como `urlCloudinary(src, ancho)`. Consecuencia: el prop `empresaSlug`
   (`:11,24`) queda sin uso y se elimina de la interfaz y de sus ~8 usos
   (`TiendaPortada`, `TarjetaProductoTienda`, `ProductDrawer`, `POS`,
   `notas-venta/[id]`, `catalogo/[slug]`, `bodega`, `alertas-stock`).
   Reemplazo: borrar la rama y el prop; borrar `__tests__/image-with-fallback-fotos-off.test.tsx` (21).
   (-~8 código + ~10 call sites; -21 test)
   - **Riesgo (rollback por flag):** bajo. Fotos está en producción; si hiciera falta
     volver atrás, `git revert` del slice. El flag se mantiene en el JSON solo si el
     DT quiere conservar la rama (no recomendado: ya no tiene lectores útiles).

2. `shrink` **Flag `tienda-portada-auto` (true, activado en `5223c9f`): rama OFF
   duplicada en dos componentes.** `components/TiendaPortada.tsx:49,53,68-72,140`
   y `components/TarjetaProductoTienda.tsx:54-55`. Con el flag ON:
   `auto` es siempre `armarPortada(conStock)` (sin ternario), `novedades`/
   `destacados`/`tituloBanner` no necesitan fallback (`:65-73`), `mostrarNuevo`
   es siempre `true` en la fila de Novedades y `mostrarBadge` = `Boolean(mostrarNuevo)`.
   Reemplazo: borrar `PORTADA_AUTO` en ambos, dejar `armarPortada` directo, y borrar
   `__tests__/portada-auto-flag-off.test.tsx` (56); `TEXTO_BANNER_FIJO` sigue usándose
   dentro de `portada-auto.ts`. (-~15 código, -56 test)
   - **Riesgo:** bajo, pero ver hallazgo 5 (badge) antes de tocar `TarjetaProductoTienda`.

3. `shrink` **Flag `pos-solo-stock` (true, activado en `cdee848`, un commit después
   de crearse): rama OFF muerta en el POS.** `app/(app)/pos/client_page.tsx:22,49,383,648`.
   Con el flag ON: `soloStock = !verSinStock` (`:49`), el check del código exacto
   siempre refetchea (`POS_SOLO_STOCK || resultadosDe !== q` → `true` constante, `:383`),
   y el checkbox "Ver sin stock" se muestra siempre (`:648`).
   Reemplazo: eliminar la constante y las guardas; `resultadosDe` deja de ser condición
   (solo se usa para el mensaje de la grilla). Borrar `__tests__/pos-stock-flag-off.test.tsx` (48).
   (-~8 código, -48 test)
   - **Riesgo:** bajo. El servidor ya rechaza stock insuficiente de forma atómica
     (`app/api/notas-venta/[id]/items/route.ts:98-113`), así que "Ver sin stock" solo
     cambia la UI, no permite vender de más.

4. `test` **45 suites mockean `@/config/feature-flags.json` con un objeto literal
   completo, sin spread del real.** Cada flag nuevo obliga a editar a mano los mocks
   que lo necesitan; el que falta queda `undefined` (falso) y el test pasa por la rama
   equivocada. Ya pasó en esta tanda: `pos2/pos3/pos4` tuvieron que agregar
   `tienda-portada-auto` y `pos-solo-stock` a mano (`__tests__/pos2-pos-page.test.tsx:16-30`).
   Reemplazo propuesto: helper `mockFlags(overrides)` en `__tests__/helpers/` que haga
   `{ ...jest.requireActual('@/config/feature-flags.json'), ...overrides }`, y migrar
   solo las suites que hoy listan flags que no les importan.
   (-~10 líneas netas, -riesgo alto de falsos verdes; tocar 45 archivos es trabajo aparte)
   - **Riesgo:** medio. Migrar todo de golpe cambia el default de los tests de
     "flag apagado" a "flag real encendido"; hacerlo por tandas (POS/shop primero).
   - **Acción inmediata (barata):** añadir un test/guard que falle si alguna suite
     mockea el JSON sin incluir una key nueva. Se deja al DT.

5. `risk` **Badge "NUEVO/Destacado" desaparece fuera de la portada.** Con
   `PORTADA_AUTO` en true, `TarjetaProductoTienda.tsx:55` calcula
   `mostrarBadge = Boolean(mostrarNuevo)`, y solo la fila de Novedades pasa
   `mostrarNuevo` (`TiendaPortada.tsx:140`, intencional y cubierto por
   `__tests__/portada-auto-render.test.tsx:97-102`). Pero también quedan sin badge:
   - grilla "Todos los productos" (`components/TiendaPortada.tsx:231`, no pasa la prop),
   - catálogo público impreso (`app/catalogo/[slug]/client_page.tsx:95`, no pasa la prop).
   La grilla es decisión de producto; el **catálogo público** probablemente no.
   No es bug de ejecución: es una regresión de comportamiento sin test. Propuesta:
   confirmar con el DT si el catálogo debe conservar el badge; si sí, pasar
   `mostrarNuevo={p.es_nuevo}` en `catalogo/[slug]`. (0 líneas si se decide que no)

6. `shrink` `hooks/useBusquedaClientes.ts:9-11,20-21,29,48,53`: `minCaracteres` y
   `debounceMs` son opciones que **ningún consumidor** sobreescribe (los 3 usan 2/200).
   Mantenerlas obliga a incluirlas en el array de deps y sugiere una configurabilidad
   que no existe. Reemplazo: constantes internas (`const MIN = 2; const DEBOUNCE_MS = 200`).
   (-3 líneas y 2 deps menos)
   - Nota: el PRD §"Refactors A16-A18" aprobó esa firma con opciones; es decisión del
     DT si se recorta la firma o se deja como contrato documentado.

7. `shrink` `components/tienda/portada-auto.ts:45-47`: `armarPortada` vuelve a filtrar
   `saldo > 0` aunque `TiendaPortada` ya llama con `conStock` filtrado
   (`components/TiendaPortada.tsx:51-53`). Recorrido O(n) duplicado y segundo lugar
   donde vive la regla "sin stock no se muestra". Reemplazo: quitar el filtro interno
   y documentar que recibe productos ya filtrados. (-2)

8. `shrink` `lib/imagen-reducir.ts:9,11,12`: `CALIDAD_JPEG`, `MAX_BASE64_BYTES` y
   `REENCODE_MIN_BYTES` se exportan pero solo se leen dentro del módulo (los tests
   importan `MAX_ENTRADA_BYTES` y `LADO_MAX`). Reemplazo: quitar `export` de los tres.
   (0 líneas netas, menos superficie pública)

9. `risk` `components/ProductDrawer.tsx:626` cambió `accept` a `image/*` mientras
   `:147` sigue rechazando todo lo que no sea JPEG/PNG/WEBP (`lib/imagen-reducir.ts:15`).
   En móvil el selector ofrece HEIC y el usuario recibe "Solo se aceptan JPG, PNG o
   WEBP" después de elegir. No es regresión de datos, sí de UX. Propuesta: `accept`
   con la misma lista (`image/jpeg,image/png,image/webp`) o excluir `image/heic`.
   (-0 líneas, 1 línea de valor)

## A17 y A18 — reevaluación con el código actual

Ambos siguen vigentes, sin cambios desde el audit del 30/10; la limpieza de flags no
los toca.

- **A17 — `lib/api-pagos.ts`.** Sigue duplicado:
  - `GET /api/caja/cuentas?activas=true`: `components/PagarNotaDialog.tsx:41` y
    `components/PosCobrarDialog.tsx:71`.
  - `POST /api/notas-venta/${id}/pagar` con `{cuenta_id, monto, forma_pago}`:
    `components/PagarNotaDialog.tsx:71` y `components/PosCobrarDialog.tsx:103`.
  - Los dos parsean la respuesta distinto (el POS lee `monto_aplicado` y
    `saldo_pendiente_restante`; el diálogo simple no lee body), así que el helper debe
    devolver `Response`/JSON y cada uno decide. La unificación es de llamadas, no de UI.
  - **Estimación:** ~20 líneas netas (helper ~15 + 2 consumidores), 2 componentes.
  - **Riesgo:** medio. Es la ruta de cobro (`notas-venta/[id]/pagar`) y caja; probar
    ambos diálogos y el caso parcial/vuelto del POS.

- **A18 — `lib/api-notas.ts`.** Sigue duplicado:
  - Crear nota: `app/(app)/pos/client_page.tsx:238-245` y
    `components/AgregarANotaVentaModal.tsx:74-81`.
  - Alta de ítem: `app/(app)/pos/client_page.tsx:248-262` y
    `components/AgregarANotaVentaModal.tsx:83-97` (mismo payload base; el POS fija
    `unidades:1, modalidad:'detalle'` y omite `precio`).
  - **Estimación:** ~15 líneas netas (helper ~12 + 2 consumidores), 2 archivos. El POS
    además cachea cliente de mesón y `recordarNota`; el helper debe aceptar `clienteId?`
    y el payload extra por parámetro.
  - **Riesgo:** medio. Toca `notas-venta` (zona frágil, stock atómico); el cambio es
    solo de llamadas, sin reformatear el resto.

## Revisado y limpio (sin recorte)

- `lib/cloudinary-url.ts` (25 líneas): `urlCloudinary` tiene dos consumidores
  (`ImageWithFallback` y tests) y `sanearCodigo` uno real (`upload/route.ts:55`) + tests.
  Sin abstracción de más. El regex `^[a-z]{1,2}_` de "ya transformada" es heurístico
  pero correcto para las URLs de Cloudinary y está comentado.
- `app/api/productos/upload/route.ts`: `fotosConfiguradas()` se llama una vez pero
  ordena el early-return antes de leer el body; `MAX_BASE64_BYTES` (4 MB) distinto del
  cliente (3 MB) está comentado a propósito (cliente reduce, servidor es el límite duro).
- `lib/cloudinary.ts`: el cambio a `public_id` estable + `overwrite` + `invalidate` es
  el mínimo para que reemplazar una foto no deje caché vieja. Sin recorte.
- `components/BottomNav.tsx`: usa `RUTAS_POR_ROL` para decidir `/pos` en vez de repetir
  la tabla; `w-14` + `overflow-x-auto` es el ajuste mínimo para 6 botones. Limpio.
- `app/api/productos/route.ts:71-82`: `es_nuevo` por defecto `false` en el alta. Correcto
  con la nueva semántica "Destacar"; cubierto por `__tests__/api/productos-es-nuevo-default.test.ts`.
- `lib/tienda-productos.ts:6-19,68-71,85-89`: `fecha_ingreso` se agrega al tipo, al
  `SELECT` (`MAX`) y al `.map()`; sin duplicar la query. Limpio.
- `lib/utils.ts:8-12`: `formatItems` es una función de 3 líneas con un lector (POS);
  no se abstrae más ni se inlinea (hay test propio de plural).
- `app/(app)/notas-venta/[id]/client_page.tsx`, `AgregarANotaVentaModal`,
  `PosClienteDialog`: el reemplazo por el hook A16 eliminó ~55 líneas sin mover el resto
  del componente; la única diferencia observable (`cargando` se apaga con query < 2)
  está declarada en el PRD y es una mejora.
- `config/feature-flags.json`: `tienda-portada-v2` no tiene lectores en código desde
  `lim1`, pero el DT decidió conservarlo (documentado en `29b`). **No tocar.**
- `hooks/useBusquedaClientes.ts:24` `limpiar`: un solo consumidor directo, pero es la
  costura que evita que el modal vuelva a mostrar la lista tras elegir; no se inlinea.

## Recomendación final

**Aplicar ahora en un slice de limpieza (`lim3`, 0 deps, 0 DB):**

1. Hallazgos **1, 2 y 3**: quitar las ramas OFF muertas de `fotos-v1`,
   `tienda-portada-auto` y `pos-solo-stock` (y sus 3 tests OFF).
2. Hallazgos **6, 7 y 8**: recortes mecánicos de una o dos líneas.
3. Hallazgo **9**: volver `accept` a la lista de tipos aceptados.

Neto estimado: **-~35 líneas de código, -125 de tests**, riesgo bajo. Mantener los
flags en el JSON o quitarlos es cosmético una vez sin ramas; recomendación: quitarlos
para que el JSON vuelva a ser la lista de interruptores vivos.

**Dejar en backlog (no en el mismo slice):**

- **A17** (~20 líneas, riesgo medio: cobro/caja) y **A18** (~15 líneas, riesgo medio:
  `notas-venta`/stock). Van juntos en un ciclo propio por la zona frágil.
- **Hallazgo 4** (helper `mockFlags`): 45 archivos, hacerlo por tandas POS/tienda.
- **Hallazgo 5** (badge en catálogo): es decisión de producto, no refactor. Preguntar
  al DT; si se conserva, es una línea en `catalogo/[slug]/client_page.tsx`.
- **Hallazgo 9** si el DT prefiere soportar HEIC: requiere decodificar HEIC en el
  servidor o un fallback; no es limpieza.
