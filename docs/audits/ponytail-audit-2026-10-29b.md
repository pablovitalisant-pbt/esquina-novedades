# Ponytail audit — 2026-10-29b

Solo lista; no se aplicó nada. Alcance: archivos no-test cambiados desde la última
limpieza (`git diff --name-only ff97876..HEAD -- app components contexts hooks lib utils
types scripts middleware.ts config migrations`, sin `*.test.*`).
Flags intencionales (`tienda-pago-online`, `tienda-mayor-online`, `tienda-portada-v2`,
`precio-mayorista-ui`, `notas-venta-modalidad`, `clientes-etiqueta`,
`mp-webhook-ignorar-ipn-legacy`, `pedido-confetti`, `registro_notas_bodega_ui`,
`env-validacion-arranque`) NO se tocan. "Sin lectores" = 0 coincidencias en grep sobre
código **y** tests.

Contexto: `tienda-portada-v2` está en `true` en `config/feature-flags.json:11` y en
producción. Todo el código de la rama flag-off (`LandingPage`, `ProductosPublicos`,
grilla vieja de `/catalogo/[slug]`) quedó sin ejecución real. Los hallazgos 1–6 son
candidatos a **borrar**; el riego de rollback por flag se indica en cada uno. Borrar es
decisión del Director Técnico.

## Resultado (Director Tecnico)
Se aplican los hallazgos 1 a 13 (slice "lim1"). El rollback de la portada pasa a ser
`git revert`: la tienda v2 está en producción y el flag `tienda-portada-v2` **se mantiene**
en `config/feature-flags.json`; solo se quita la rama muerta (flag-off). Hallazgo 12: se
corrigen ambos `href="/productos"` de `app/pedido/[id]/page.tsx` (≈124 y ≈201) a `href="/"`.
Hallazgo 14 **no se aplica**: los tests estáticos se quedan.

## Hallazgos (mayor recorte primero)

1. `delete` `components/LandingPage.tsx` (219 líneas) muere con el flag ON: su único
   lector es la rama flag-off de `app/page.tsx:143-144`; el resto son tests. Reemplazo:
   nada. (-219)
   - Evidencia: `grep -rn LandingPage` → solo `app/page.tsx:7,144` y `__tests__/*`.
   - **Riesgo (rollback por flag):** si el DT quiere poder volver a la portada
     institucional poniendo `tienda-portada-v2=false`, borrarlo elimina el rollback;
     en ese caso el rollback pasa a ser `git revert`. El flag se mantiene: solo se
     quita la rama muerta.

2. `delete` `app/productos/client_page.tsx` (`ProductosPublicos`, 109 líneas): su único
   lector es `app/productos/page.tsx:13-14`, rama flag-off. Con el flag ON la página
   redirige antes. Reemplazo: nada. (-109)
   - Evidencia: `grep -rn ProductosPublicos` → `app/productos/page.tsx:4,14` y
     `__tests__/{catalog-footer,tienda-modalidad,slice8b-...-flag-off}`.
   - **Riesgo (rollback por flag):** mismo caso que 1.

3. `delete` `app/page.tsx:18-38,40-92,143-144` (`LandingRow`, `mapRows`,
   `getLandingProductos`): 75 líneas solo usadas por la rama flag-off. Rehace por
   completo la query de `getProductosTienda` (`lib/tienda-productos.ts:62-92`): mismo
   `GROUP BY codigo` + `MAX()` + `HAVING SUM(saldo) > 0`, con `getLatestIngresoRealCodigos`
   y un fallback. Reemplazo: nada; con el flag ON ya se llama `getProductosTienda`. (-78)
   - Evidencia: `app/page.tsx:48-67` vs `lib/tienda-productos.ts:62-82` (misma forma,
     distinto `LIMIT 8`); `grep -rn getLandingProductos` → solo `app/page.tsx:143`.

4. `delete` Grilla vieja de `app/catalogo/[slug]/client_page.tsx:60-133` (~74 líneas) y
   sus imports que quedan sin uso (`ImageWithFallback:4`, `BotonAgregarPedido:6`,
   `formatCLP:13`, `Badge:14`, `CatalogFooter:16`). Con el flag ON el return temprano de
   `:51-58` siempre gana. Reemplazo: dejar solo `CatalogoTienda`; `CarritoProvider` y
   `CarritoDrawer` siguen. (-76)
   - Evidencia: `app/catalogo/[slug]/client_page.tsx:50-58` retorna antes del `const grid`.
   - **Riesgo (rollback por flag):** si se conserva la rama flag-off, se conserva esto.

5. `delete` CSS muerto en `app/globals.css`: `.landing-page` y sus `--landing-*`
   (`:212-227`, 16), `.catalogo-header` (`:10-12`, 3), `.print-page-container`
   (`:26-29`, 4), `.catalogo-footer` (`:65-68`, 4). Reemplazo: nada. (-27)
   - Evidencia: `grep -rn "landing-page\|catalogo-header\|print-page-container\|catalogo-footer"`
     → solo `components/LandingPage.tsx:24` y la grilla vieja del hallazgo 4;
     `CatalogFooter.tsx` no usa la clase `.catalogo-footer`.
   - `.print-page` **NO** se toca: lo usa el `CatalogoTienda` actual (`:178,181`).

6. `shrink` `app/productos/page.tsx:8-14` queda reducible a `permanentRedirect('/')`
   incondicional al aplicar 2: se van `import flags`, `getProductosTienda`,
   `ProductosPublicos` y el `if`. 15 → ~4 líneas. (-11)
   - Evidencia: `app/productos/page.tsx:10-14` es la única rama; con 2 borrado no queda
     nada que renderizar.

7. `delete` Campos `cantcaja` y `umed` de `ProductoTienda`: con el flag ON ningún
   componente de tienda los lee (solo la `ProductosPublicos` del hallazgo 2). Se van del
   tipo, del tipo de fila, del `SELECT` y del `.map()`. Reemplazo: nada. (-7)
   - Evidencia: `lib/tienda-productos.ts:12-13,35-36,69-70,90`; `grep` de
     `cantcaja|umed` en `TiendaPortada`, `TarjetaProductoTienda`, `catalogo/[slug]`
     (diseño nuevo) → 0 lecturas.

8. `shrink` `ProductoTarjeta` (`components/TarjetaProductoTienda.tsx:9-19`) repite 9 de
   los 11 campos de `ProductoTienda` (`lib/tienda-productos.ts:6-19`). Reemplazo:
   `export type ProductoTarjeta = Pick<ProductoTienda, 'id'|'codigo'|'detalle'|'imagen_url'|'es_nuevo'|'precio'|'precio_mayor'|'minimo_mayor'|'saldo'>`
   con `import type` (erased, no arrastra `lib/db` al cliente). (-9)
   - Evidencia: comparar ambos bloques; los únicos campos extra en `ProductoTienda` son
     `categoria`, `cantcaja`, `umed` (este último se va en 7).

9. `shrink` Filtro de búsqueda+categoría duplicado: `TiendaPortada.tsx:63-75` y
   `CatalogoTienda` (`app/catalogo/[slug]/client_page.tsx:147-153`) repiten la misma
   lógica sobre `normalizar()` (categoría + detalle/código). Reemplazo: `filtrarProductos(items, {categoria, busqueda})`
   en `components/tienda/` y usarlo en ambos. (-~12, neto ~-6 tras crear el helper)
   - Evidencia: `TiendaPortada.tsx:66-69` vs `catalogo/[slug]/client_page.tsx:150-151`
     (idénticas salvo el `[...out]` del orden).

10. `shrink` `TiendaPortada` declara dos veces el mismo tipo de props (wrapper y
    `TiendaPortadaInner`). Reemplazo: un `type Props` reutilizado. (-6)
    - Evidencia: `components/TiendaPortada.tsx:26-31` idéntico a `:50-55`.

11. `shrink` `botonCategoria` se exporta sin lectores externos. Reemplazo: quitar
    `export`. (-1)
    - Evidencia: `components/tienda/BarraCategorias.tsx:41`; `grep` → solo usos internos
      `:23,31`.

12. `native` `app/pedido/[id]/page.tsx:124` enlaza `href="/productos"`: con el flag ON
    esa ruta es un `permanentRedirect('/')`, o sea un salto extra. Reemplazo: `href="/"`. (-1)
    - Evidencia: `app/productos/page.tsx:10-12`; `app/pedido/[id]/page.tsx:124`.

13. `delete` Tests de la rama flag-off / grilla vieja: dejan de compilar al aplicar 1–4.
    Hay que borrarlos en el mismo slice, no "después". (-~500)
    - `__tests__/slice-landing-page-public.test.tsx` (209), `slice-landing-v2.test.tsx`
      (269, incluye aserciones estáticas sobre `.landing-page` en CSS),
      `slice8a-tienda-portada-flag-off.test.tsx` (39),
      `slice8b-tienda-publicas-flag-off.test.tsx` (56),
      `__tests__/catalog-footer.test.tsx` (69, monta `ProductosPublicos`),
      `__tests__/catalogo-print.test.tsx` (81, mockea el flag en false).
    - `__tests__/slice3b-ui-modalidad-detalle-mayor.test.tsx:16,207` importa y renderiza
      `LandingPage`: hay que reapuntarlo a `TiendaPortada` (o borrar ese caso).
    - `__tests__/slice2a-clp.test.ts:20` lista `components/LandingPage.tsx` y
      `app/productos/client_page.tsx` en su guard de `formatCLP`: actualizar la lista.

14. `delete` Tests puramente estáticos (leen el fuente con `fs.readFileSync` y aseguran
    texto/estructura): no ejercitan comportamiento y ya blindaron varias estructuras
    internas. Reemplazo: nada o un test de render. (-~220, fuera del alcance de archivos
    no-test pero pedido explícitamente)
    - `__tests__/deseados-zofri-cleanup.test.ts` (52), `subslice-b-badges.test.ts` (60),
      `slice20-precios-smoke.test.ts` (47), `slice3-rename-smoke.test.ts` (186, casi solo
      `fs`). Verificar en Fase A que ninguna de sus aserciones sea la única cobertura de
      una regla de negocio.

## Revisado y limpio (sin recorte)

- `lib/empresa.ts:28-36` `hexToRgb`/`hexToArgb`: 3-4 líneas cada uno, 2 lectores reales
  (`notas-venta/[id]` y `caja-mayor`) y tests propios. No vale inlinearlos.
- `lib/tienda-productos.ts:48-95` `getProductosTienda` es la query única de la tienda v2;
  tras aplicar 3 queda como único camino. Sin recorte.
- `components/tienda/{TiendaHeader,TiendaFooter,FranjaBeneficios,FranjaConfianza}`: cada
  uno un solo bloque de JSX, un lector o dos (`TiendaPortada` y `CatalogoTienda`),
  sin props especulativas. Limpios.
- `components/TarjetaProductoTienda.tsx:39-96`: `mostrarPrecio`/`mostrarStock` tienen
  ambos lectores en `CatalogoTienda:195-196`; no son props muertas.
- `app/page.tsx:94-118` (`getCategoriasConStock`, `getOpcionesEntregaActivas`): solo la
  rama v2 las usa y ahí se quedan.
- **Duplicación de colores `globals.css` ↔ `lib/empresa.ts`:** son dos fuentes de verdad
  (`--primary: #590078` vs `EMPRESA.colores.primario`), pero no hay recorte de líneas
  posible: CSS necesita hex y el código TS necesita los mismos valores para PDF/Excel/QR.
  Alternativa (solo DT): generar los tokens del CSS desde un único módulo en build. No
  se propone por coste > beneficio.
- **Hex de marca hardcodeados en `components/tienda/*`, `TiendaPortada`,
  `TarjetaProductoTienda` (47 ocurrencias de `#590078`/`#F2B936`/`#21002F`/`#FFF8EA`/
  `#FFE6A0`):** se podrían reemplazar por `var(--primary)`, `var(--accent)`,
  `var(--heading)`, etc. (ya definidos en `globals.css:93-201`). No es recorte de
  líneas (mismo largo), es deduplicación de valores: riesgo de contraste en modo oscuro
  y un slice propio. Se deja fuera de esta lista.
- `COLOR_EXCEL` (`caja-mayor/client_page.tsx:17-24`) vs los `hexToArgb` inline de
  `notas-venta/[id]`: 2 call sites, no se abstrae (una abstracción para 2 usos es el
  caso que ponytail evita).
- `components/ui/{button,dialog,sheet}.tsx`: los 3 diffs son cambios de token
  (`bg-background`→`bg-popover`/`bg-card`, `text-primary-foreground`→`text-[#FFF8EA]`)
  para modo oscuro; no son duplicación ni código muerto.

net: -~555 líneas de código (−~740 con los tests de 13) y −~500 si se suman los tests
estáticos de 14; 0 deps. 0 columnas. Sin DROP de DB.
