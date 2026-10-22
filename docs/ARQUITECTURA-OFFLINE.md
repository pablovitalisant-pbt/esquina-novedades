> **OBSOLETO** — PowerSync y el service worker se eliminaron en el Slice 3 (PRD §4: offline fuera del MVP). Se conserva solo como historia.

# Arquitectura Offline-First — Bazar Naty

Decisión aprobada por Pablo (Product Owner) el 2026-08-01.
Este documento es la referencia obligatoria para todos los slices del
proyecto offline. Claude Code debe leerlo antes de cualquier ciclo PBT-IA
que toque sincronización, service worker o data layer.

## 1. Problema

El cliente opera en Bermejo, Bolivia, con conectividad muy mala o nula en
bodega y galpón. La aplicación completa debe funcionar sin internet y
sincronizar automáticamente al recuperar conexión.

## 2. Decisión

- **Motor de sincronización: PowerSync Cloud** (plan Free, $0/mes,
  decisión de negocio registrada: se asume el riesgo de desactivación
  tras 1 semana de inactividad; upgrade a Pro $49/mes se evaluará antes
  o después del deploy a producción según comportamiento real).
- **PWA con Serwist** (`@serwist/next`) para app shell offline y manifest.
- **Base local: SQLite embebido (Wasm)** del SDK web de PowerSync.
  Las lecturas de la UI se resuelven contra SQLite local, no contra `/api/*`.
- **Escrituras: cola de subida de PowerSync (`uploadData`)** que apunta a
  endpoints propios de Next.js. La validación server-side existente
  (invariante anti-drift, reservas de stock) se conserva y se ejecuta al
  sincronizar. NO se adopta Neon Data API ni Neon Auth (la guía oficial de
  PowerSync los usa en su demo; nosotros mantenemos next-auth y API routes).
- **Auth del sync service:** JWT custom emitido desde next-auth
  (diseño en Fase 0).

## 3. Lo que NO funciona offline (excepciones físicamente inevitables)

- Primer login de un dispositivo nuevo (necesita validar credenciales).
- Subida de imágenes a Cloudinary.
- Exports (Excel/PDF que dependen de datos server-side) — evaluar caso
  por caso; los que se generan client-side desde SQLite local sí funcionan.
- Catálogo público (`/catalogo/[slug]`, `/productos`, `/`): lo consumen
  clientes externos con internet. Fuera de alcance offline.
- **Contador de la campanita de alertas de stock** (`contexts/
  AlertasContext.tsx`, `stockBajoCount`): sigue siendo un `fetch('/api/
  alertas-stock')` puro sin rama offline (falla en silencio, mantiene el
  último valor conocido — no rompe nada, pero no se actualiza sin red).
  Señalado durante el diseño de Slice 15 (Alertas de stock). Corregirlo
  bien requiere un `PowerSyncProvider` montado globalmente en el layout
  raíz — hoy cada módulo monta el suyo, scopeado a su propia página. Es
  un cambio de arquitectura más grande que un slice individual.
  **Pendiente, diferido a pedido explícito de Pablo (2026-08-01)** — no
  se ataca hasta que se retome como su propio slice.

## 4. Política de conflictos (aprobada)

- Las operaciones offline se aplican en el servidor **en orden de llegada**
  con la validación server-side existente.
- Si al sincronizar una operación ya no es válida (ej. stock insuficiente
  porque otro dispositivo vendió antes), la operación **no se aplica
  silenciosamente ni se pisa**: queda marcada "en conflicto" y aparece en
  una **bandeja de revisión** para resolución manual (Fase 2).
- Caja es mayormente append-only (inserts): riesgo de conflicto bajo.
- Stock es el recurso compartido crítico: toda escritura que afecte stock
  pasa por validación al aplicarse en el servidor.
- Cada mutación offline lleva UUID generado en cliente (idempotencia:
  reintento de sync no duplica).

## 5. Fases

### Fase 0 — Infraestructura (bloqueante para todo lo demás)

**Estado (2026-08-01): pasos 1 y 2 completados y verificados.**

1. ✅ (Manual, Pablo) Neon: replicación lógica habilitada en la rama
   production `br-holy-darkness-acadbszt` (`wal_level = logical`
   confirmado); `powersync_role` creado con `rolreplication = true`
   confirmado; publicación `powersync` creada y confirmada
   (`SELECT pubname FROM pg_publication` → `powersync`).
2. ✅ (Manual, Pablo) PowerSync Cloud: proyecto `bazar-naty`, instancia
   `Development`, conexión a Neon guardada y probada (Test Connection
   exitoso). Client Auth configurado con **HS256** (no JWKS asimétrico —
   ver nota de deuda técnica abajo): KID `bazar-naty-hs256-v1`, secreto
   compartido generado y guardado por Pablo (no versionado, no compartido
   en este chat). Instance URL:
   `https://6a6df4a491ecf2aec48f3e78.powersync.journeyapps.com`.
   Sync Stream `bodega_test` deployado (ver sección 5b).
3. ✅ (Slice 3, commit `b3a161c`) PWA base con Serwist: `app/sw.ts` con
   precache del app shell + fallback `/offline` para navegaciones sin
   red. Dos bugs reales encontrados y corregidos con causa raíz
   verificada contra código fuente instalado (no por prueba y error):
   (a) `middleware.ts` no excluía `sw.js` de su matcher de auth →
   `SecurityError` al registrar el SW (un script de SW no puede pasar
   por una redirección); (b) el `defaultCache` de Serwist no matchea
   navegaciones de forma fiable (su entrada "HTML" evalúa
   `Content-Type`, un header de respuesta ausente en requests) → se
   agregó una estrategia `NetworkFirst` explícita para
   `request.mode === "navigate"` con el fallback `/offline`
   correctamente adherido. Además, `NetworkOnly` forzado para todo
   `/api/*` antes de `defaultCache` (no cachear `/api/powersync/token`,
   sesión-específico). **Verificado en navegador**: SW activo, navegación
   offline real sirve `/offline` (evidencia con DevTools Network),
   `/admin/powersync-status` sin regresión estando online. Contrato en
   `docs/slices/offline-slice-03-pwa-serwist.md`.

**Fase 0 completa.** Los tres slices commiteados y verificados en
producción. Arranca Fase 1.
4. ✅ (Slice 1, commit `a32aa09`) JWT next-auth → PowerSync:
   `GET /api/powersync/token` firma JWT HS256 (KID `bazar-naty-hs256-v1`,
   `sub` = id de usuario next-auth, `aud` = Instance URL, expiración 30
   min) a partir de la sesión next-auth existente. Verificado en
   producción (`bazarnaty.vercel.app`) con evidencia HTTP real y
   decodificación independiente del JWT — payload y expiración correctos.
   Contrato completo en `docs/slices/offline-slice-01-powersync-token.md`.
5. ✅ (Slice 2, commit `cb922af`) SDK PowerSync web: esquema SQLite local
   mínimo (`productos`, `ubicaciones_bodega` — Bodega piloto),
   `BackendConnector` + `PowerSyncProvider`, página de diagnóstico
   `/admin/powersync-status`. **Pipeline Neon → PowerSync → SQLite local
   verificado end-to-end**: conteos de filas idénticos entre Neon
   producción y el navegador (5 productos, 1 ubicación), sin errores de
   hidratación. Contrato completo en
   `docs/slices/offline-slice-02-powersync-client-sdk.md`.

**Fase 0 casi cerrada — solo falta el Slice 3 (PWA/Serwist).** El pipeline
de datos ya está probado; lo que falta es la capacidad de arrancar la app
con cero conectividad desde frío (app shell offline).

**Deuda técnica registrada:** Client Auth usa HS256 (secreto compartido),
válido para desarrollo/testing según la propia documentación de
PowerSync, pero no recomendado para producción. Migrar a JWKS asimétrico
(RSA/EdDSA) antes del primer deploy a producción — agregar a "Zonas de
riesgo conocidas" del PRD cuando se llegue a esa fase.

### 5b. Sync Stream de prueba (diseño, pendiente de aplicar por Pablo)

Antes de escribir código de cliente, verificamos el pipeline completo
Neon → PowerSync con un stream mínimo de solo lectura, sin filtrar por
usuario (la app es single-tenant; toda la plantilla de personal ve el
mismo inventario — no aplica el patrón multi-usuario de la demo oficial
de PowerSync). Alcance: las dos tablas centrales de Bodega, elegido como
módulo piloto por tamaño/simplicidad técnica (ver nota en Fase 1 — no es
prioridad de negocio, todos los módulos del MVP deben quedar offline).

```yaml
config:
  edition: 3

streams:
  bodega_test:
    auto_subscribe: true
    queries:
      - SELECT * FROM productos
      - SELECT * FROM ubicaciones_bodega
```

Pasos para Pablo: PowerSync Dashboard → Sync Streams → pegar este YAML →
Validate → Deploy. Esto es temporal para Fase 0 (validar conectividad
end-to-end); en Fase 1 se diseñan streams reales por módulo, con
particionamiento si el volumen lo justifica (hoy no: negocio pequeño).

### Fase 1 — Migración módulo por módulo

**Alcance: los 11 módulos del MVP (PRD sección 3) deben funcionar offline.
Ninguno tiene prioridad de negocio sobre otro — el requisito del cliente es
la app completa.** El orden de implementación abajo es una secuencia técnica
de ingeniería (de qué conviene migrar primero por tamaño/complejidad/riesgo),
no una escala de importancia. Pablo puede reordenar esta secuencia en
cualquier momento sin que eso implique dejar módulos fuera del alcance final.

Orden técnico propuesto (a confirmar/ajustar):
1. Bodega — módulo piloto: pocas tablas, sin dependencias de otros módulos,
   sirve para validar el pipeline completo (Neon → PowerSync → SQLite local
   → UI → escritura → sync) antes de replicarlo en los 10 módulos restantes.
2. Notas de Venta — módulo con más lógica de negocio y de conflicto de stock.
3. Productos / Precios
4. Caja Mayor
5. Categorías, Clientes, Alertas de stock, Usuarios, Config de caja,
   Catálogo (admin)

Por módulo: lecturas → SQLite local; escrituras → cola de subida →
endpoint propio con validación. Cada módulo en slices ≤200 líneas,
ciclo PBT-IA completo. Fase 1 no se da por cerrada hasta que los 11
módulos del MVP funcionen offline.

**Progreso Bodega (módulo piloto, 1 de 11):**

- ✅ (Slice 4, commit `0908f16`) Lectura offline: `BodegaContent` usa
  `usePowerSync()` y consulta SQLite local (`db.getAll()`, réplica del
  LEFT JOIN de `/api/ubicaciones`) cuando el flag `bodega-offline-lectura`
  está activo. Paridad byte a byte verificada contra la API en vivo.
  Gateado por flag, default `false`.
- ✅ (Slice 5, commit `9b83175`) Escritura offline: `UbicacionEditor.handleSave`
  usa `db.execute()` local con el mismo flag; `BackendConnector.uploadData()`
  sube la cola a `PUT /api/ubicaciones/codigo/[codigo]` (endpoint existente,
  sin lógica duplicada). Fix crítico de este slice: la transacción CRUD
  solo se completa (`transaction.complete()`) en éxito 2xx o en un 400
  permanente de validación — ante excepción de red, 401 o 500 se re-lanza
  sin completar, dejando que el SDK reintente automáticamente (el
  `finally` incondicional original descartaba escrituras offline en
  reconexiones con race condition). Verificado en producción: guardado
  offline → reconexión → sync a Neon confirmado, incluyendo doble edición
  offline del mismo producto (gana la última). Backfill
  `migrations/025_backfill_ubicaciones_bodega.sql` aplicado en producción
  para garantizar que todo producto tiene fila en `ubicaciones_bodega`
  (todo write local es UPDATE, nunca INSERT). Flag `bodega-offline-lectura`
  sigue en `false` en producción (controla lectura + escritura juntas).

**Bodega (lectura + escritura) completo y verificado en producción,
detrás de flag en `false`. Bodega es el único módulo con soporte offline
completo hasta ahora — faltan 9 módulos del MVP.**

**Progreso Notas de Venta (módulo 2 de 11):**

- ✅ (Slice 6, commit `79c75f0`) Lectura offline: `PrenotasPage` y
  `PrenotaDetallePage` montan `PowerSyncProvider` solo si el flag
  `notas-venta-offline-lectura` está activo; `fetchPrenotas`/`fetchPrenota`
  replican `GET /api/notas-venta` y `GET /api/notas-venta/[id]` contra
  SQLite local (5 tablas nuevas en `AppSchema.ts`: `prenotas`,
  `prenota_items`, `clientes`, `caja_movimientos`, `caja_movimiento_notas`,
  diseñadas contra el uso real del código, no contra `migrations/` — drift
  documentado en PRD §10). Se preserva deliberadamente la asimetría del
  endpoint real (la lista no resta reembolsos de `total_pagado`, el
  detalle sí). **Escritura explícitamente fuera de alcance**: depende de
  la bandeja de revisión de conflictos (Fase 2, no construida) — escribir
  cambios de stock offline sin eso violaría la política de conflictos ya
  aprobada (sección 4). Verificado: paridad SQLite vs Postgres con datos
  reales de Neon, rol `bodeguero` bloqueado server-side en `page.tsx`
  antes de montar cualquier componente offline, suite sin regresiones
  nuevas. Flag `notas-venta-offline-lectura` en `false` en producción.

**Sync Stream ampliado y verificado (2026-08-01):** las 5 tablas nuevas
deployadas en PowerSync Cloud. Verificación manual con flag `true` y
evidencia real (Puppeteer + revisión directa en navegador): paridad
lista/detalle confirmada, orden de la lista con 2+ notas de fechas
distintas coincide con la API. Se encontró y resolvió **BUG-029**
(`created_at` faltaba en la tabla local `prenotas` → "Invalid Date" en la
lista) — fix de una línea en `AppSchema.ts`, commits `17becb8`/`6826c95`/
`8bc979b`, ver `BUGS.md`. Notas de Venta (lectura) queda cerrado.
Escritura offline diferida a un slice futuro, después de que exista la
bandeja de conflictos de Fase 2.

**Progreso Precios/Productos (módulo 3 de 11):**

- ✅ (Slice 7, commit pendiente) Lectura offline del buscador: `PreciosClient`
  monta `PowerSyncProvider` solo si el flag `precios-offline-lectura` está
  activo; `fetchProducts` replica el `GROUP BY`/`HAVING` de
  `GET /api/productos` contra SQLite local. Tabla `productos` (ya existía
  desde Bodega) ampliada con 8 columnas (`prcventa`, `prcminimo`, `costo`,
  `margen_pct`, `categoria`, `stock_minimo`, `pesocaja`, `cubicaja`) —
  cambio aditivo, no rompe la lectura de Bodega. `SQLite` no tiene
  `BOOL_OR`, se usa `MAX(es_nuevo)` sobre el entero 0/1. Sin filtro de
  `empresa_id` (single-tenant). **Escritura explícitamente fuera de
  alcance**: editar precio/costo/margen depende de la invariante
  anti-drift calculada server-side (`calcularPrecio`) y propaga a
  `ubicaciones_bodega`/`prenota_items` en una transacción — no replicable
  de forma segura en local. Crear producto casi siempre implica subir
  imagen a Cloudinary, ya documentado como imposible offline (sección 3).
  Verificado: paridad SQLite vs Postgres con datos reales de Neon
  (búsqueda case-insensitive, `HAVING soloStock` excluye saldo 0), sin
  regresión en Bodega ni en el flag `false`. Flag `precios-offline-lectura`
  en `false` en producción — no requiere tocar el Sync Stream (`productos`
  ya estaba incluido desde Fase 0).

**Pendiente para Precios:** verificación manual de Pablo con el flag en
`true` (buscar producto conocido online/offline, comparar contra la API;
confirmar exclusión de productos con `saldo = 0` con "Solo con stock").

**Progreso Caja Mayor (módulo 4 de 11) — slice dividido explícitamente:**

Caja Mayor es el módulo más grande del proyecto (1436 líneas en
`client_page.tsx`, 15 endpoints, 8 bugs históricos documentados en
`BUGS.md`). Se divide en 3 slices de lectura (vista principal → resumen
por cliente → búsqueda unificada) más una decisión de negocio: **ninguna
escritura de Caja Mayor entra en Fase 1** — es dinero, el argumento de la
bandeja de conflictos de Fase 2 aplica con más fuerza que en stock.

- ✅ (Slice 8, commit pendiente) Lectura offline de la vista principal:
  movimientos paginados con filtros (`GET /api/caja/movimientos`) + saldos
  por cuenta (`GET /api/caja/resumen-cuentas`). 4 tablas nuevas en
  `AppSchema.ts` (`caja_cuentas`, `caja_cierres`, `caja_saldos_iniciales`,
  y ampliación de `caja_movimientos` que Slice 6 había declarado solo con
  `tipo`). SQLite no tiene `ARRAY_AGG`, se usa `GROUP_CONCAT` + parseo a
  array en JS. El algoritmo de intercalado de cierres con movimientos
  (por rango de fechas) es réplica literal del de la API. Verificado:
  paridad SQLite vs Postgres con datos reales de Neon en 4 combinaciones
  de filtros + página 2 + `notas_imputadas`; sin regresión. **Limitación
  registrada:** 0 cierres reales en los datos de prueba — el merge de
  cierres no se ejerció contra datos reales, solo contra el algoritmo
  espejado; validar cuando exista un cierre real. Flag
  `caja-mayor-offline-lectura` en `false` en producción.
- **Diferido a Slice 8b:** resumen de notas por cliente
  (`GET /api/caja/resumen/[kcodcli2]`) y notas pendientes por cliente
  (`GET /api/caja/notas/[kcodcli2]`) — se disparan solo al seleccionar
  un cliente.
- **Diferido a Slice 8c:** búsqueda unificada (`nota-busqueda`,
  `clientes`) — autocompletado al crear un movimiento.

**Decisión de secuencia (2026-08-01, Pablo):** después de cerrar Slice 8,
la Fase 1 de solo-lectura se pausa antes de seguir con los módulos
puramente administrativos (Categorías, Clientes, Alertas de stock,
Usuarios, Config de caja, Catálogo admin — todos de bajo uso en
bodega/galpón). Se prioriza diseñar **Fase 2 (bandeja de conflictos)**
a continuación, porque: (a) desbloquea escritura offline real en Notas de
Venta y Caja Mayor, que es donde está el valor de campo; (b) corrige una
brecha ya detectada en Bodega — hoy un fallo permanente de sincronización
(400 de validación) se descarta con solo un `console.error`, sin la
"bandeja de revisión" que la política de la sección 4 de este documento
promete. Los módulos administrativos de solo lectura quedan para el
final de Fase 1, después de Fase 2.

**Abierto, sin diagnosticar aún — no bloquea Bodega pero sí el resto de
Fase 1:** al probar navegación offline hacia una ruta nunca visitada en
la sesión (ej. `/bodega` → "alertas de stock") corriendo con `npm run dev`,
la cache `serwist-precache-...` existe pero aparece vacía y la página
se renderiza sin estilos. Hipótesis de trabajo (no confirmada): el
precache de Serwist depende del build de producción y es poco fiable en
modo dev. Se intentó reproducir con `npm run build && npm run start`,
pero el login falla en una ventana de incógnito nueva (redirige al login
sin dejar entrar) — causa aún no investigada (posible diferencia de
variables de entorno o cookies entre `dev` y `start`). Decisión de Pablo:
diferir el diagnóstico a cuando se pruebe contra el deploy real de
producción (Vercel), no en local. Pendiente antes de dar Fase 1 por
avanzada más allá de Bodega.

### Fase 2 — Conflictos y observabilidad

**Diseño aprobado por Pablo (2026-08-01).**

**Problema:** un conflicto solo se detecta en el momento en que un
dispositivo offline recupera conexión e intenta sincronizar — es decir,
en ese instante preciso sí hay red. Hoy (Bodega, único módulo con
escritura offline) una operación que falla de forma permanente al
sincronizar (400 de validación real) se descarta en silencio, solo con
un `console.error()` — nadie lo ve. Viola la política de la sección 4 de
este documento.

**Decisión de diseño — registro server-side, no solo local:** el
conflicto se guarda en una tabla nueva en Neon (`sync_conflictos`), no
solo en el dispositivo. Razón: visible desde cualquier lugar con
conexión, sobrevive aunque el dispositivo se resetee, se revisa desde una
pantalla de administración 100% online — la bandeja en sí **no** forma
parte del sistema offline, no necesita PowerSync ni Sync Stream.

**Modelo de datos (`sync_conflictos`):** tabla/operación que falló,
payload completo (JSON), código/id de la entidad afectada, status HTTP y
mensaje de error del servidor, quién lo intentó y cuándo, estado
(`pendiente`/`resuelto`) con quién resolvió y qué acción tomó.

**Alcance MVP de la bandeja — simple, deliberadamente acotado:** la única
acción disponible es **descartar** (marcar como revisado). No incluye
"editar y reintentar" en esta primera versión.

**Deuda registrada explícitamente (pedido de Pablo, no diferir en
silencio):** falta ampliar la bandeja más allá de "descartar" para poder,
más adelante, **editar el payload y reintentar la sincronización
directamente desde la bandeja** (hoy el reintento, si se quiere, hay que
hacerlo manualmente desde la pantalla normal del módulo — por ejemplo,
volver a cargar el conteo en Bodega). Encarar como un slice futuro una
vez que la bandeja esté en uso real y se entienda qué tipos de conflicto
aparecen en la práctica.

**Slices — completos (2026-08-01):**
- ✅ **9a** (commit `ae56ff8`) — tabla `sync_conflictos` (migración 026,
  aplicada en producción por Pablo) + endpoints `POST`/`GET`/`PATCH`.
  11 tests, 0 regresiones.
- ✅ **9b** (commit `31d8f82`) — wiring de `BackendConnector.uploadData()`
  para reportar el conflicto al endpoint en vez de solo loguear en
  consola (afecta Bodega, único módulo con escritura hoy). Gateado por
  flag `sync-conflictos-reporte` (default `false`). Señal 1 respetada:
  no se tocó la lógica de `shouldComplete`/retry del fix de Slice 5.
- ✅ **9c** (commit `b284108`) — pantalla `/admin/sync-conflictos`:
  listar conflictos pendientes, acción "descartar" con confirmación,
  manejo correcto del 409 de idempotencia. Sin feature flag (decisión
  deliberada — ruta nueva, no modifica comportamiento existente, el
  control de acceso ya lo dan middleware + guard SSR por rol). Link
  agregado a `TopNav.tsx`/`BottomNav.tsx`.

**Fase 2 (alcance MVP) cerrada.** La bandeja de conflictos existe y está
en producción, detrás del flag de reporte (`false` por default — activar
cuando se quiera empezar a capturar conflictos reales de Bodega).
Pendiente de verificación manual de Pablo: forzar un 400 real con el
flag activo y confirmar el flujo end-to-end (tabla → pantalla →
descartar).

**Otros pendientes de Fase 2 (sin diseñar aún):**
- Indicadores UI: online/offline, pendientes de sync, errores.
- Smoke E2E offline: operar sin red → reconectar → verificar sync.

## 6. Riesgos registrados (verificar en Fase 0)

| Riesgo | Detalle | Mitigación |
|---|---|---|
| Desactivación plan Free | PowerSync Free se desactiva tras 1 semana de inactividad; los dispositivos siguen operando localmente pero dejan de sincronizar | Uso diario real del negocio; monitorear; upgrade a Pro si ocurre |
| Neon compute sin scale-to-zero | La replicación lógica activa puede mantener el compute de Neon despierto → posible aumento de costo Neon | Verificar consumo real tras Fase 0 |
| Slot de replicación eliminado | Neon elimina slots inactivos tras ~40h | PowerSync mantiene el slot activo mientras el servicio esté conectado; encadenado al riesgo de desactivación Free |
| Sesión next-auth expirada offline | Usuario offline con cookie vencida no puede re-autenticarse | Diseñar tolerancia en Fase 0 (paso 4): la app local sigue operando; re-auth al reconectar |
| Tests/tsc preexistentes rotos | `ignoreBuildErrors: true` enmascara errores; el refactor masivo del data layer aumenta el riesgo | Ponytail audit antes de arrancar Fase 1 |

## 7. Fuentes verificadas (2026-08-01)

- Integración oficial: https://docs.powersync.com/integrations/neon
- Pricing: https://www.powersync.com/pricing
- Replicación lógica Neon: https://neon.com/docs/guides/logical-replication-postgres
