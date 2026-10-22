# Slice 9c (Offline, Fase 2) — Bandeja de conflictos: pantalla admin

Contrato Fase A propuesto por Claude (Director Técnico). Depende de
Slice 9a (commit `ae56ff8`, endpoints ya en producción) y Slice 9b
(commit `31d8f82`, wiring ya en producción detrás de flag). Ver
`docs/ARQUITECTURA-OFFLINE.md` sección "Fase 2". Cierra Fase 2 tal como
está diseñada hoy (MVP: solo "descartar").

## Objetivo

Pantalla `/admin/sync-conflictos`: lista de conflictos pendientes
(`GET /api/sync-conflictos`), con acción "Descartar" por fila
(`PATCH /api/sync-conflictos/[id]`).

## Decisión: sin feature flag

A diferencia de los slices anteriores, esta pantalla **no lleva flag**.
Razón: no modifica ningún comportamiento existente — es una ruta nueva,
nadie navega ahí hoy. El control de acceso real ya existe (rol `admin`
vía `RUTAS_POR_ROL['admin']` en `middleware.ts` + guard SSR explícito en
`page.tsx`, mismo patrón que `/admin/usuarios`). Agregar un flag acá
sería el antipatrón ya señalado en `PRD.md` §9.28 (flags que no gatean
nada real, solo trazabilidad).

## Contrato

### Archivos nuevos

- **`app/(app)/admin/sync-conflictos/page.tsx`** — guard SSR admin-only,
  mismo patrón que `app/(app)/admin/usuarios/page.tsx`:
  ```tsx
  import { getServerSession } from "next-auth";
  import { authOptions } from "@/lib/auth";
  import { redirect } from "next/navigation";
  import { SyncConflictosClient } from "./client_page";

  export default async function SyncConflictosPage() {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).rol !== "admin") {
      redirect("/dashboard");
    }
    return <SyncConflictosClient />;
  }
  ```

- **`app/(app)/admin/sync-conflictos/client_page.tsx`** — `'use client'`,
  mismo patrón que `admin/usuarios/client_page.tsx` (fetch en
  `useEffect`, `Table`/`TableBody`/`TableCell`/`TableHead`/`TableHeader`/
  `TableRow` de `components/ui/table`, `Badge`, `Button`, `toast` de
  `sonner`). Columnas: fecha (`created_at`), tabla, operación, entidad
  (`entidad_id`), usuario (`usuario_nombre`), error (`error_mensaje`,
  con `http_status` como badge), acción ("Descartar" con `confirm()`
  antes de ejecutar, mismo patrón que `handleEliminar` en Notas de
  Venta). Sin resultados → mensaje "No hay conflictos pendientes"
  (positivo, no un placeholder de error). `payload` completo visible en
  un detalle expandible o tooltip — decisión de Claude Code, mantenerlo
  simple (puede ser un `<details>` nativo con `JSON.stringify(payload,
  null, 2)`, no hace falta un componente nuevo).

### Navegación

Agregar el link a `/admin/sync-conflictos` en el menú de Administración,
en `components/TopNav.tsx` (confirmado — líneas ~176-190, dropdown de
Admin con `/admin/usuarios`, `/admin/caja-config`, `/admin/categorias`)
**y** `components/BottomNav.tsx` (mismo menú, versión mobile — verificar
que existe la misma lista ahí antes de asumir que es solo TopNav).

### No se toca

`app/api/sync-conflictos/**` (se consume tal cual, sin cambios),
`lib/powersync/**`, cualquier otro archivo.

## Revisión de impacto lateral

¿Qué archivo existente necesita cambiar para que esto quede integrado?
`components/TopNav.tsx` (confirmado) y, si aplica, `components/BottomNav.tsx`
— agregar el link nuevo al dropdown/menú de Administración. Nada más:
confirmado por grep, sin otro archivo que referencie la lista de rutas
admin fuera de `middleware.ts`/`lib/rutas-por-rol.ts` (ya cubiertos por
el guard de rol, no requieren cambio).

## Riesgos a cubrir en Fase B

- **Renderizado condicional según rol**: doble guard (middleware +
  SSR) — test de que un no-admin no puede montar el componente.
- **Acción "Descartar" con confirmación**: evitar descarte accidental
  (mismo patrón que anular una Nota de Venta) — cubrir que sin confirmar
  no se llama al `PATCH`.
- **Doble clic en "Descartar"**: el backend ya es idempotente (409 si ya
  resuelto, Slice 9a) — verificar que la UI maneja ese 409 con gracia
  (no un error genérico feo, algo como "ya fue resuelto, actualizando
  lista").
- **Lista vacía**: estado inicial real del sistema (todavía no hay
  conflictos reportados en producción) — no debe verse como un error.

## Verificación esperada (Fase D)

1. No-admin → redirigido, no ve la pantalla.
2. Admin, sin conflictos pendientes → mensaje claro, no error.
3. Admin, con al menos un conflicto (puede requerir crear uno de prueba
   manualmente vía `POST /api/sync-conflictos` o forzando un 400 real
   con el flag de Slice 9b activo) → aparece en la tabla con los datos
   correctos, "Descartar" lo saca de la lista y lo marca `resuelto` en
   Neon.
4. `npm run build` y suite completa sin regresiones.
