# Bugfix — Búsqueda de cliente/nota offline en Caja Mayor (hueco de Slice 11b)

Encontrado durante la verificación manual de Task #2 (Caja Mayor). No es un
bug nuevo introducido por nada reciente — es una omisión real del contrato
original de Slice 11b: el buscador unificado de "Cliente o nota de venta"
(usado para armar un **cobro**, no un gasto) nunca recibió una rama offline.
"Gasto" funciona offline porque no usa este buscador; "cobro" queda
bloqueado porque no se puede seleccionar cliente/nota sin red, y sin cliente
seleccionado tampoco se dispara nunca la imputación manual (que si tiene su
rama offline, del Slice 11b original — ese código está bien, el problema es
un paso antes).

## Evidencia

`app/(app)/caja-mayor/client_page.tsx` líneas 401-430 — el `useEffect` de
"Búsqueda unificada (cliente o nota)" hace `fetch(endpoint)` sin ningún
condicional `OFFLINE_READ && db`, a diferencia de todos los demás fetch de
este mismo archivo (`fetchMovimientos`, `notasPendientes`, etc.) que sí
tienen su rama local. Confirmado con `Read` directo (no con grep, para
evitar falsos positivos de renderizado ya vistos antes en esta sesión).

## Fix

Mismo archivo, agregar rama offline al `useEffect` de la línea 402,
replicando los dos endpoints que reemplaza:

```ts
useEffect(() => {
  const isDigits = /^\d+$/.test(searchQuery);

  if ((isDigits && searchQuery.length < 3) || (!isDigits && searchQuery.length < 2)) {
    setSearchResults([]);
    setSearchOpen(false);
    return;
  }

  if (OFFLINE_READ && db) {
    // Lectura local: replica GET /api/caja/nota-busqueda (isDigits) y
    // GET /api/caja/clientes (si no). total_pagado se arma con un merge en
    // JS contra caja_movimiento_notas (mismo patrón que notasPendientes,
    // evita el JOIN SQL directo contra un id que localmente es texto).
    setSearchLoading(true);
    const q = searchQuery.trim().toLowerCase();
    (async () => {
      try {
        if (isDigits) {
          const rows = (await db.getAll(
            `SELECT p.id, p.created_at AS fecha, p.cliente_id, p.nombre_cliente,
               COALESCE(SUM(pi.unidades * pi.precio), 0) AS total
             FROM prenotas p
             LEFT JOIN prenota_items pi ON pi.prenota_id = p.id
             WHERE CAST(p.id AS TEXT) LIKE ? OR LOWER(p.titulo) LIKE ? OR LOWER(p.nombre_cliente) LIKE ?
             GROUP BY p.id
             LIMIT 10`,
            [`%${q}%`, `%${q}%`, `%${q}%`]
          )) as any[];
          const pagos = (await db.getAll(
            `SELECT prenota_id, SUM(monto_aplicado) AS total FROM caja_movimiento_notas GROUP BY prenota_id`
          )) as any[];
          const pagoMap = new Map<number, number>();
          for (const p of pagos || []) pagoMap.set(Number(p.prenota_id), Number(p.total));
          const results: ResultadoBusqueda[] = (rows || [])
            .map((r: any) => {
              const total = Number(r.total);
              const total_pagado = pagoMap.get(Number(r.id)) ?? 0;
              return {
                tipo: "nota" as const,
                nota: {
                  id: Number(r.id),
                  fecha: r.fecha,
                  total,
                  total_pagado,
                  saldo_pendiente: total - total_pagado,
                  cliente_id: r.cliente_id,
                  nombre_cliente: r.nombre_cliente,
                  origen: "bazar-naty" as const,
                },
              };
            })
            .sort((a, b) => {
              const aPending = a.nota.saldo_pendiente > 0.005 ? 0 : 1;
              const bPending = b.nota.saldo_pendiente > 0.005 ? 0 : 1;
              if (aPending !== bPending) return aPending - bPending;
              return a.nota.fecha.localeCompare(b.nota.fecha);
            });
          setSearchResults(results);
          setSearchOpen(results.length > 0);
        } else {
          const rows = (await db.getAll(
            `SELECT p.cliente_id, c.nombre, COUNT(*) AS total_compras, MAX(p.created_at) AS ultima_compra
             FROM prenotas p
             JOIN clientes c ON c.id = p.cliente_id
             WHERE LOWER(c.nombre) LIKE ? OR LOWER(p.titulo) LIKE ?
             GROUP BY p.cliente_id, c.nombre
             ORDER BY ultima_compra DESC
             LIMIT 15`,
            [`%${q}%`, `%${q}%`]
          )) as any[];
          const results: ResultadoBusqueda[] = (rows || []).map((r: any) => ({
            tipo: "cliente" as const,
            cliente: {
              cliente_id: r.cliente_id,
              nombre: r.nombre,
              total_compras: Number(r.total_compras),
              ultima_compra: r.ultima_compra,
            },
          }));
          setSearchResults(results);
          setSearchOpen(results.length > 0);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    })();
    return;
  }

  const endpoint = isDigits
    ? `/api/caja/nota-busqueda?q=${encodeURIComponent(searchQuery)}`
    : `/api/caja/clientes?q=${encodeURIComponent(searchQuery)}`;

  const timer = setTimeout(async () => {
    setSearchLoading(true);
    const res = await fetch(endpoint);
    if (res.ok) {
      const json = await res.json();
      const data: any[] = json.data || [];
      const results: ResultadoBusqueda[] = isDigits
        ? data.map((n) => ({ tipo: "nota" as const, nota: n as NotaBusquedaResult }))
        : data.map((c) => ({ tipo: "cliente" as const, cliente: c as ClienteOption }));
      setSearchResults(results);
      setSearchOpen(results.length > 0);
    }
    setSearchLoading(false);
  }, 250);
  return () => clearTimeout(timer);
}, [searchQuery, OFFLINE_READ, db]);
```

Notar: `p.cliente_id` (texto, UUID desde 13a) contra `c.id` (id interno de
PowerSync, siempre texto) — comparación texto-texto, sin el bug de
ids-siempre-texto (a diferencia de `caja_movimientos.cuenta_id` contra
`caja_cuentas.id`, que sí lo tiene pero por una razón distinta ya aceptada:
`caja_cuentas.id` nunca migra a UUID).

Agregar `OFFLINE_READ` y `db` al array de dependencias del `useEffect`
(antes solo `[searchQuery]`) — necesario para que la búsqueda pase a modo
local en cuanto `db` esté disponible (PowerSyncProvider puede montar después
del primer render).

## No se toca

Nada más — `notasPendientes` (línea 471+) y el resto del flujo de escritura
offline (`handleSubmit`, `BackendConnector.ts`) ya funcionan bien, confirmado
por Pablo (gasto offline sincronizó correctamente).

## Verificar

1. Offline: buscar por nombre de cliente (mínimo 2 caracteres) → aparecen
   resultados de clientes con al menos una nota.
2. Offline: buscar por número de nota (mínimo 3 dígitos) → aparecen
   resultados de notas, ordenadas pendientes primero.
3. Seleccionar un cliente → tildar "Imputación manual" → confirmar que
   `notasPendientes` (ya funcionaba) ahora sí tiene con qué poblarse.
4. Registrar un cobro offline con imputación manual completa, reconectar,
   confirmar en Neon que `caja_movimientos` + `caja_movimiento_notas`
   quedaron bien vinculados.
5. Regresión online: la búsqueda sigue funcionando igual que antes con el
   flag en cualquier valor, estando online.
6. `npm run build` limpio, suite sin regresiones. DIFF antes de commit.
