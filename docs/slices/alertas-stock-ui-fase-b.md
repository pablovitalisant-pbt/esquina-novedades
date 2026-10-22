# Sub-slice 2 UI — Fase B: Análisis de riesgos

## Riesgo 1: Acceso directo por URL sin rol autorizado

**page.tsx** solo verifica sesión (`redirect("/login")`), no rol. Un vendedor que tipee
`/alertas-stock` directamente llega al `client_page.tsx`, que hace `fetch("/api/alertas-stock/lista")`
y recibe 401 del backend (ya cambiado a `admin || bodeguero` en Sub-slice 1).

**Test:** mockear sesión como vendedor, renderizar client_page, mockear fetch con 401,
verificar que la UI muestra mensaje de error controlado (no explota, no pantalla en blanco).
→ **Safety net** — debe mostrar error informativo, no crashear.

## Riesgo 2: Doble click en botones de acción

"Ignorar" y "No reponer" hacen PUT sin bloquear el botón durante el vuelo. Un doble click
rápido dispara 2 PUTs concurrentes. "Ignorar" está protegido por `ON CONFLICT DO NOTHING`
en el backend (idempotente). "No reponer" no tiene esa protección — 2 PUTs concurrentes
son inofensivos (mismo UPDATE idempotente), pero el segundo podría retornar antes de que
el refetch refresque la lista, mostrando el producto aún en pantalla brevemente.

**Test:** mockear PUT para que tarde 500ms, clickear 2 veces rápido, verificar que el
botón se deshabilita durante el vuelo y solo se hace 1 llamada PUT.
→ **Debe fallar ahora** — el código actual no tiene `saving`/`disabled` state en los botones.

## Riesgo 3: Loading state — flash de "No hay productos"

Al montar, `fetch("/api/alertas-stock/lista")` está en vuelo y la lista es `[]`. Si no hay
un estado `loading`, se muestra "No hay productos bajo stock mínimo" durante la carga,
lo que es un falso negativo.

**Test:** mockear fetch para que nunca resuelva (pending), verificar que se muestra
un spinner/skeleton, no el mensaje de vacío.
→ **Debe fallar ahora** — no hay código, pero el test define el contrato: la UI debe
tener `loading` state inicial `true`.

## Riesgo 4: Error de red — fetch falla

Si `GET /api/alertas-stock/lista` falla (500, red caída), la UI debe mostrar un error,
no quedarse en loading infinito ni crashear.

**Test:** mockear fetch con reject/500, verificar que se muestra mensaje de error y
no queda spinner eterno.
→ **Safety net** — define contrato de error handling.

## Riesgo 5: Lista vacía legítima

Cuando no hay productos bajo `stock_minimo` (todos tienen `stock_minimo = NULL` o
`saldo >= stock_minimo`), la respuesta es `{ data: [] }`. La UI debe mostrar el
mensaje de vacío, no un error.

**Test:** mockear fetch con `{ data: [] }`, verificar mensaje "No hay productos
bajo stock mínimo".
→ **Safety net** — sin falsos positivos ni errores.

## Riesgo 6: refreshStockBajo después de "Ignorar"

Al silenciar un producto, el badge count del contexto debe actualizarse. `refreshStockBajo()`
ya existe en el contexto y se llama después del PUT. El test verifica que el mock de
fetch para el count se llama después de la acción.

**Test:** mockear PUT 200, mockear GET count, clickear "Ignorar", verificar que
`refreshStockBajo` se dispara (fetch a `/api/alertas-stock` es llamado).
→ **Safety net** — la integración con el contexto ya existe, solo confirmamos que se usa.

## Riesgo 7: Renderizado condicional de severidad

El badge de severidad usa `deficit / stock_minimo`. Si `stock_minimo = 0` (borde),
división por cero → `deficit / 0 = Infinity`. Si ambos son positivos pero `deficit = 0`
(borde, justo en el límite), el badge debe ser verde (0% = sin déficit real, pero la
query filtra `saldo < stock_minimo`, así que `deficit > 0` siempre).

**Test:** mockear datos con distintos ratios de déficit, verificar que el badge tiene
la clase correcta para cada severidad.
→ **Safety net** — contrato de clasificación visual.

## No aplica (descartado explícito)

- **Hydration mismatch SSR vs client**: `useSession()` de NextAuth ya maneja el estado
  de carga inicial. El `page.tsx` es server component que redirige si no hay sesión —
  para cuando el client component se hidrata, la sesión ya está resuelta. No hay flash
  de contenido incorrecto porque el nav se renderiza completo del lado cliente con
  `session.status === "authenticated"`. Descartado.
- **vendedor ve el link en nav**: Ya resuelto en Fase A — el link está envuelto en
  `(isAdmin || rol === 'bodeguero')`, vendedor no lo ve. Descartado.

---

## Plan de tests

2 riesgos en rojo, expandidos en 4 tests individuales + 5 safety nets = 9 tests.
Archivo: `__tests__/alertas-stock-ui.test.tsx` (nuevo).

| # | Riesgo | Tipo | Qué verifica |
|---|--------|------|-------------|
| R1 | Acceso vendedor → 401 | Safety net | Error controlado, no crash |
| R2a | Doble click — botón disabled | **ROJO** | `saving` state deshabilita botón durante PUT |
| R2b | Doble click — 1 sola llamada | **ROJO** | Solo 1 PUT aunque se clickee 2 veces |
| R3a | Loading — spinner visible | **ROJO** | Spinner durante carga inicial |
| R3b | Loading — no mensaje vacío | **ROJO** | No muestra "No hay productos" hasta resolver fetch |
| R4 | Error de red | Safety net | Mensaje de error, no spinner eterno |
| R5 | Lista vacía | Safety net | Mensaje "No hay productos" |
| R6 | refreshStockBajo | Safety net | Context count se actualiza |
| R7 | Severidad badge | Safety net | Color correcto según ratio |

**Nota sobre "fallar ahora":** `client_page.tsx` no existe aún. Los tests lo importan
desde `@/app/(app)/alertas-stock/client_page`. Antes de Fase C, el import falla con
`Cannot find module` → todos los tests del componente están en rojo por definición.
Después de Fase C, el componente existe y los 9 tests se ejecutan realmente, con R2a/R2b/R3a/R3b
verificando los comportamientos que la implementación debe cumplir (saving state, loading state).
