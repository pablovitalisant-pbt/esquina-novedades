# Ponytail audit — 2026-10-30

Solo lista; no se aplicó nada, no se commiteó nada. Alcance: archivos no-test
cambiados desde `c57e259` (`git diff --name-only c57e259..HEAD -- app components
lib hooks utils middleware.ts config migrations scripts`, excluyendo `*.test.*`).
Foco pedido: duplicación del POS (`app/(app)/pos/client_page.tsx` vs
`PosCobrarDialog`, `PosClienteDialog`, `AgregarANotaVentaModal`,
`PagarNotaDialog`), código muerto, helpers de `lib/` reimplementados y props
sin uso. Los flags (`pos-v1`, etc.) NO se tocan. "Sin lectores" = 0
coincidencias en grep sobre código **y** tests.

Contexto: toda la tanda es POS v1 (slices pos1–pos4 + logo real + forma de pago
TARJETA). `PosCobrarDialog` y `PosClienteDialog` son nuevos; `PagarNotaDialog`
NO es código muerto (ver hallazgo 2). No hay migración ni columna que borrar.

## Hallazgos (mayor recorte primero)

1. `shrink` Búsqueda de clientes (debounce 200 ms + `AbortController` +
   `/api/clientes?q=`) implementada **tres veces** casi idéntica:
   `components/PosClienteDialog.tsx:56-78`, `components/AgregarANotaVentaModal.tsx:62-88`
   y `app/(app)/notas-venta/[id]/client_page.tsx:391-417`. Reemplazo: un hook
   `useBusquedaClientes(q)` en `hooks/` (ya existe el patrón en `hooks/useShareImage.ts`)
   que devuelva `{ clientes, loading }`; cada consumidor lo llama en 1-2 líneas.
   (-~50 neto: ~26×3 → hook ~22 + 3 usos)
   - Evidencia: los tres bloques son el mismo `if (q.trim().length < 2) return;
     abort(); setTimeout(…200); fetch('/api/clientes?q='+encodeURIComponent(q))`;
     el propio comentario en `notas-venta/[id]/client_page.tsx:391` lo admite
     ("patrón AgregarANotaVentaModal"). El de PosClienteDialog además repite la
     misma lógica de "recientes" que nadie más tiene, pero esa parte es propia.

2. `shrink` Carga de cuentas + POST de pago duplicados entre `PagarNotaDialog`
   y `PosCobrarDialog`: ambos hacen `GET /api/caja/cuentas?activas=true`
   (`PagarNotaDialog.tsx:38-58` vs `PosCobrarDialog.tsx:73-83`) y
   `POST /api/notas-venta/${id}/pagar` con `{cuenta_id, monto, forma_pago}`
   (`PagarNotaDialog.tsx:71` vs `PosCobrarDialog.tsx:107`). Reemplazo:
   `lib/api-pagos.ts` con `getCuentasActivas()` y `registrarPago(notaId, pago)`;
   ambos diálogos los llaman. (-~20)
   - **`PagarNotaDialog` NO es código muerto:** sigue montado en
     `app/(app)/notas-venta/client_page.tsx:209` y
     `app/(app)/notas-venta/[id]/client_page.tsx:1138`; `grep PagarNotaDialog`
     → 2 imports reales + mocks de tests. NO borrar.
   - Riesgo: el POS necesita vuelto/parcial que PagarNotaDialog no tiene; la
     unificación debe ser de *llamadas*, no fusionar los dos diálogos.

3. `shrink` `type Producto` local en `app/(app)/pos/client_page.tsx:19-28`
   (8 campos) repite campos que ya existen en `interface Producto`
   (`types/index.ts:24-47`). Reemplazo:
   `type Producto = Pick<import('@/types').Producto, 'codigo'|'detalle'|'imagen_url'|'empresa_id'|'prcventa'|'precio_mayor'|'saldo'|'categoria'>`.
   (-8, y una fuente de verdad menos)
   - Evidencia: los 8 nombres coinciden exactamente con `types/index.ts`; hoy
     si cambia la forma de la API el POS no se entera.

4. `shrink` "¿se puede vender por mayor?" con **tres reglas distintas**:
   `pos/client_page.tsx:318-322` `tienePrecioMayor` = `Number(p.precio_mayor) > 0`;
   `AgregarANotaVentaModal.tsx:23` `puedeMayor` = `producto.precio_mayor != null`
   (deja pasar `0`); `lib/precio-mayor.ts:2` `esPrecioMayorValido` = `null` o
   entero `> 0`. Reemplazo: usar `esPrecioMayorValido` en ambos, o un
   `puedeVenderMayor(p)` en `lib/precio-mayor.ts`. (-~3 y cierra la divergencia)
   - Evidencia: `grep -rn "precio_mayor" lib/precio-mayor.ts`; la UI del modal
     puede habilitar "Por mayor" con `precio_mayor = 0` mientras el POS lo
     bloquea — mismo dato, dos veredictos.

5. `shrink` Creación de nota + alta de ítem duplicada entre el POS y
   `AgregarANotaVentaModal`: ambos `POST /api/notas-venta` con
   `{cliente_id?}` (`pos/client_page.tsx:197-208` vs `AgregarANotaVentaModal.tsx:96-106`)
   y `POST /api/notas-venta/${id}/items` con el mismo payload base
   (`codigo, descripcion, imagen_url, empresa_id, stock_referencia`)
   (`pos/client_page.tsx:209-221` vs `AgregarANotaVentaModal.tsx:107-120`).
   Reemplazo: `lib/api-notas.ts` `crearNota(clienteId?)` + `agregarItem(notaId, producto, extra)`.
   (-~10; el POS fija `unidades:1, modalidad:'detalle'` y omite `precio`, el
   modal manda ambos — el helper recibe el extra por parámetro)

6. `shrink` `type FormaPago` repetido: `PosCobrarDialog.tsx:11` y el union
   inline en `PagarNotaDialog.tsx:31` / `caja-mayor/client_page.tsx:68`. Con la
   llegada de `'tarjeta'` hubo que tocar 3 sitios a mano (diff de pos1).
   Reemplazo: `export type FormaPago = 'efectivo'|'tarjeta'|'transferencia'|'cheque'`
   en `types/index.ts` y usarlo en los tres. (-~2, evita el próximo toque manual)
   - Evidencia: `grep -rn "efectivo.*tarjeta.*transferencia"` → las 3 copias.

7. `shrink` `const precio = (s: string) => Number(s || 0)` en
   `PosCobrarDialog.tsx:22` se usa **una vez** (`:88` `precio(monto)`).
   Reemplazo: `const montoNum = Number(monto || 0);` e inline. (-1 archivo de
   ruido; no abstraer un helper para un uso)

8. `delete` (revisado, se queda) `app/(app)/pos/client_page.tsx:314-317`
   `productosPorCodigo` + `tienePrecioMayor`: parecía un `useMemo` especulativo,
   pero lo lee `fila` en cada línea (`:480`) para deshabilitar el botón
   POR MAYOR. Sin recorte propio; solo se simplifica en el hallazgo 4.

## Props sin uso

Revisados los componentes cambiados; ninguna prop muerta:
- `PosCobrarDialog`: `open, onOpenChange, notaId, saldoPendiente, usuarioId,
  onNuevaVenta, onPagado` — todos con lector (`usuarioId` en la clave de
  localStorage `:53`).
- `PosClienteDialog`: `open, onOpenChange, onSelect` — todos usados.
- `PagarNotaDialog`: `notaId, saldoPendiente, open, onOpenChange, onSuccess` —
  todos usados.
- `AgregarANotaVentaModal`: `open, onClose, producto` — usados.
- `MarcaLogo` (`logoClassName` nuevo): usado en `AppShell`, `TopNav`,
  `TiendaHeader`, `pedido/[id]`.
- `PosPage({ session })`: `session` solo se lee para `session?.user?.id` → sí
  se usa.

## Revisado y limpio (sin recorte)

- `lib/ruta-inicio.ts` (nuevo): `rutaInicio` y `rutaCallbackSegura` son puras,
  con 3 lectores reales cada una (`login`, `app/page.tsx`, `middleware`). No es
  abstracción de un solo uso; el comentario prohíbe importar server en edge, y
  se respeta.
- `lib/rutas-por-rol.ts`: solo se añadió `'/pos'` a admin y vendedor. Limpio.
- `middleware.ts`: usa `rutaInicio`, sin recomputar la tabla de roles. Limpio.
- `app/manifest.ts`: `start_url` depende del flag (sin rol); no puede reusar
  `rutaInicio` (no hay sesión). Correcto.
- `app/api/productos/route.ts`: quitar el early-return de `search` vacío para
  alimentar la grilla del POS es intencional y sirve a los dos usos (búsqueda y
  listado). Limpio; sin abstracción que sacar.
- `app/api/clientes/route.ts`: filtro `rut` añadido al WHERE existente; una
  rama, sin duplicar la query. Limpio.
- `config/feature-flags.json` + `migrations/048_cliente_meson.sql` +
  `scripts/migrations-order.ts`: alta de `pos-v1` (true), migración idempotente
  y una línea en el orden. Limpios.
- `app/(app)/caja-mayor/client_page.tsx` y `notas-venta/[id]/client_page.tsx`:
  diffs acotados (agregar `'tarjeta'`, logo en PDF, `?accion=pdf|whatsapp`). No
  introducen helpers duplicados nuevos.
- `components/{AppShell,BottomNav,TopNav,MarcaLogo,TiendaHeader}.tsx` y
  `app/(auth)/login/page.tsx`: cambios de logo y de entrada por rol. Sin props
  ni lógica especulativa.

net: -~97 líneas (0 nuevas dependencias, 2 módulos `lib/api-*` + 1 hook),
0 columnas, sin DROP de DB.

## Resultado (Director Tecnico)

Decisión 2026-10-30, aplicada en slice `lim2`:

- **Se aplican 3, 4, 6 y 7.**
  - 3: `app/(app)/pos/client_page.tsx` usa `Producto` de `types/index.ts` (se elimina el tipo local de 8 campos).
  - 4: nueva `puedeVenderMayor(p)` en `lib/precio-mayor.ts` (precio_mayor no nulo y entero > 0, apoyada en `esPrecioMayorValido`); usada en el POS y en `AgregarANotaVentaModal`. Antes el modal habilitaba "Por mayor" con `precio_mayor = 0`; ahora no. Test de regresión para el caso `0` en `__tests__/lib/precio-mayor.test.ts`.
  - 6: `FormaPago` compartido en `types/index.ts`, usado en `PosCobrarDialog`, `PagarNotaDialog` y `caja-mayor/client_page.tsx`.
  - 7: se elimina el helper `precio()` de un solo uso en `PosCobrarDialog` (inline `Number(monto || 0)`).
- **NO se aplican 1, 2 ni 5** (refactors que tocan `notas-venta`, zona frágil; además el POS tiene vuelto/parcial que `PagarNotaDialog` no tiene). Anotados en `docs/BACKLOG.md` (A16–A18).
- **Extra (hallazgo del DT):** clases Tailwind rotas por un reemplazo de tokens previo (`]NNN`) corregidas en `app/` y `components/`; ver lista en `AUTO-LOG.md` (slice `lim2`).
