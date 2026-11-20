<!-- Ejecutado por Claude-Deep (Fase A, /ponytail-audit) el 2026-11-20 sobre 3609a02..54abba3. Notas de verificacion del DT al final. -->

# Ponytail audit #14 — 3609a02..HEAD (13 cortes)

Informe de solo lectura. Sin cambios aplicados.

## Hallazgos priorizados

### Alto

**1. `shrink` — SELECT duplicado completo en la lista de pedidos.** `app/api/pedidos/route.ts:424-450`
Las dos ramas de `flags['pedidos-entrega']` repiten ~22 líneas idénticas; solo difieren en `p.entregado_en::text, p.entregado_por_nombre,`. Mismo patrón que el `filtro` de arriba: un fragmento condicional dentro de una sola query.
Importa: dos copias del SELECT drifts en cuanto alguien agrega una columna (ya pasó con `imagen_url` en otro sitio). Propuesta: `${entrega ? sql`p.entregado_en::text, p.entregado_por_nombre,` : sql``}`. **-20 líneas.**

**2. `shrink` — parseo de `usuario_id` de sesión en 4 copias.** `app/api/productos/route.ts:90-94`, `app/api/productos/[id]/cambiar-codigo/route.ts:61-66`, `app/api/pedidos/[id]/entrega/route.ts:71-76` (idénticas, 5 líneas cada una) y la variante laxa `Number(...)` en `app/api/notas-venta/[id]/route.ts:11-13` (produce `NaN`, no `null`).
Importa: es lógica de seguridad de FK (`usuarios.id` entero NOT NULL); un cambio debe aplicarse 4 veces y la variante de notas ya divergió. `lib/session.ts` ya existe y ya es el punto de entrada de sesión. Propuesta: `usuarioIdSesion(user): number | null` con la versión estricta. **+8 en lib, -18 en rutas.**

**3. `shrink` — `formatFecha`/`formatFechaHora` en 5 lugares + fecha cruda nueva.** `app/(app)/pedidos/client_page.tsx:78-104`, `app/(app)/bodega/historial/client_page.tsx:22-34`, `app/(app)/deudores/client_page.tsx:44-51`, `app/(app)/notas-venta/client_page.tsx:112-117`, `lib/pdf-pedido.ts:113-120`.
Además, el código nuevo `components/CajaDetalleNotaDialog.tsx:53` muestra `detalle.created_at` crudo de Postgres (`2026-11-20 11:32:33.928739+00`) — exactamente el texto que B3 ya había resuelto en pedidos; y el helper de historial es el único que no normaliza el texto de Postgres.
Importa: el negocio ya pagó dos bugs (BUG-009, B3) por formateos dispersos; cada pantalla nueva reabre la puerta. Propuesta: `formatFecha`/`formatFechaHora` en `lib/fechas.ts` (con `normalizarFechaPostgres` + TZ Chile adentro) y consumirlos; `pedidos/client_page.tsx:90` ya re-exporta `normalizarFechaPostgres` por los tests, así que el re-export cubre la compatibilidad. **-30 líneas netas.**

### Medio

**4. `shrink` — extracción de mensajes de error repetida en `lib/api-notas.ts:24-35` y `:65-68`.** `crearNota` y `agregarItem` hacen el mismo `res.json()` + `typeof err.error === 'string'`. Helper local de 5 líneas. **-4 líneas.**

**5. `yagni` — `descargarPdf` solo delega.** `lib/pdf-pedido.ts:71-73` envuelve `doc.save(filename)` para un único llamador (`pedidos/client_page.tsx:278`); existe porque dos tests lo mockean. Inline y ajustar el mock. **-2 líneas.**

**6. `shrink` — regex UUID en 4 copias.** `app/api/pedidos/[id]/route.ts:9`, `app/api/pedidos/[id]/entrega/route.ts:9`, `app/api/admin/pagos-app/[id]/comprobante/route.ts:7`, `CarritoDrawer.tsx:21`. Una constante exportada (`lib/utils.ts` o `lib/session.ts`) evita que una corrección de validación quede a medias.

**7. `shrink` — el cast `(flags as Record<string, boolean>)` aparece 28 veces en 22 archivos** (p. ej. `app/api/productos/[id]/historial/route.ts:33`, `app/(app)/bodega/historial/page.tsx:15`). Un `flagsActivo(nombre)` en `lib/` lo elimina de todas las llamadas. Es el hallazgo más repetido, pero toca 22 archivos: backlla, no slice de limpieza.

### Bajo

**8. Títulos de nota con fecha en UTC (no en Chile).** `app/api/notas-venta/route.ts:86-90` y `lib/pedidos/convertir.ts:57` hacen `new Date().toLocaleDateString('es-CL')` **sin `timeZone`** en el servidor (UTC): una nota creada a las 21:30 en Chile queda fechada al día siguiente. Es correctness, no complejidad, y es previo a este lote — pero cae exactamente en el mismo helper del hallazgo 3; el slice lo cierra gratis.

**9. Tests nuevos: no hay recorte que valga la pena.** Cada suite de API redeclara `jest.mock('next-auth')` + `jest.mock('@/lib/db')` y sus `textos()`/`queries()` (p. ej. `__tests__/api/pedidos-entrega.test.ts:14-51`, `__tests__/api/productos-historial.test.ts:15-80`). Unificarlo requiere vencer el hoisting de `jest.mock` y ahorra ~6 líneas por archivo: no compensa. La fricción real de `__tests__/integration/*` es la **BD TEST compartida** (BUG-018), que es un problema de infraestructura de tests, no de código.

**10. `VER` — historial truncado muestra los 500 más antiguos.** `app/api/productos/[id]/historial/route.ts:246-247` ordena `ASC` y corta antes de `slice(0, 500)`: con >500 movimientos el usuario nunca ve los recientes ni el saldo de cierre (el resumen se anula). Es una decisión de producto, no de complejidad; anotarla en backlog.

## Lo que NO hay que tocar (y por qué)

- **SQL del historial** (`historial/route.ts:105-248`, `lib/historial.ts`): CTE + `UNION ALL` + ventanas es la forma mínima de expresar "movimientos por ventana de código". Está documentado con las fuentes y sus límites de signo; partirlo o moverlo a JS sería más código, no menos. La lógica pura ya está separada y testeada.
- **`app/(app)/pedidos/client_page.tsx` (507 líneas)**: largo por densidad de handlers de UI, no por abstracción especulativa. Partirlo por tamaño solo agrega archivos e indirección; el hallazgo 3 ya le quita ~26 líneas. No se recomienda un slice de división.
- **`components/TiendaPortada.tsx`**: los cinco `!filtrando &&` son explícitos y legibles; agruparlos en un wrapper no ahorra líneas. `auto?.secciones` es defensa sobrante pero inocua. `verTodos` conserva `scrollIntoView` porque re-clicar la categoría activa no re-dispara el efecto. Nada que cortar.
- **`lib/pdf-pedido.ts` completo**: su cabecera ya declara la duplicación con el PDF de la nota como deuda de backlog (`lib/pdf-pedido.ts:1-3`). Unificar dos builders de layout jsPDF (~300 líneas) es riesgo alto y no es "limpieza".

## Slice recomendado ya (dos, ≤200 líneas cada uno)

| Slice | Archivos | Líneas netas | Riesgo |
|---|---|---|---|
| A: `usuarioIdSesion` (#2) | `lib/session.ts` + 4 rutas | ≈ -10 | Bajo — mismo comportamiento, cubierto por `productos-crear-stock-inicial`, `productos-cambiar-codigo`, `pedidos-entrega` |
| B: fechas (#3, #4 y #8) | `lib/fechas.ts` + 6 consumidores + `api-notas.ts` | ≈ -30 | Medio-bajo — solo presentación y títulos; re-export mantiene `b3-fecha-pedidos` en verde |

Dejar #1 para un tercer slice junto con el flag de entrega, o incluirlo en A (sigue bajo las 200 líneas): es el recorte más limpio del lote.

**Deuda para backlog:** #5, #6, #7, #9, #10, unificación de PDFs, fixtures de la BD TEST compartida.

`net: -65 líneas, -1 wrapper, -0 deps posibles` en el alcance recomendado; unificar los PDFs llevaría el total a ~-350 pero queda fuera de un slice.
## Verificacion del DT (2026-11-20)

- #8 confirmado: `app/api/notas-venta/route.ts:86` y `lib/pedidos/convertir.ts:57` arman el titulo con `new Date().toLocaleDateString('es-CL')` sin `timeZone`; en el servidor (UTC) una nota creada despues de las 21:00 de Chile queda titulada con el dia siguiente.
- #3 confirmado con matiz: `components/CajaDetalleNotaDialog.tsx:53` muestra `detalle.fecha || detalle.created_at`; `GET /api/notas-venta/[id]` (lib/notas-venta/detalle.ts, `SELECT p.*`) no trae `fecha`, asi que se ve el ISO crudo en UTC ("2026-11-20T11:32:33.928Z"), no el texto de Postgres. Igual es un defecto visible.
- #2 confirmado: `app/api/notas-venta/[id]/route.ts:12` usa `Number(usuarioSesion(session).id)` (NaN si no es numerico).
- #10 confirmado: el historial ordena ASC y corta a 500, asi que con mas movimientos se pierden los recientes.
- Decision: hacer los slices A (#1 + #2) y B (#3 + #4 + #8). #5, #6, #7, #9, #10 y unificar PDFs pasan a backlog.
