# Sub-slice 2 UI — Fase A

**Fecha:** 2026-07-04

---

## Revisión de impacto lateral (obligatorio)

### Navegación

`components/TopNav.tsx` (línea 136-148): sección Bodega con links a `/bodega`, `/bodega/despachos`, `/bodega/registro-notas`. **No existe link a `/alertas-stock`.** Hay que agregarlo.

`components/BottomNav.tsx` (línea 125-143): sheet "Bodega" visible para `admin || bodeguero || vendedor`, con links a `/bodega`, `/bodega/despachos`, `/bodega/registro-notas`. **No existe link a `/alertas-stock`.** Hay que agregarlo.

**Conclusión:** `TopNav.tsx` y `BottomNav.tsx` entran en el slice (+5 líneas cada uno).

### AlertasContext

`contexts/AlertasContext.tsx` (línea 20): `fetch('/api/alertas-stock')` → `data.count`. El endpoint de Sub-slice 1 ya devuelve `{ count: number }`. **Ya funciona, cero cambios.**

### `design-skill/`

Leídos: `SKILL.md`, `tables.md`, `badges.md`, `colors.md`, `buttons.md`, `cards.md`, `layout.md`, `typography.md`, `shadows.md`, `radius.md`, `borders.md`.

---

## Archivos del slice

| # | Archivo | Tipo | Líneas | Descripción |
|---|---------|------|--------|-------------|
| 1 | `app/(app)/alertas-stock/page.tsx` | NEW | ~10 | Server component wrapper |
| 2 | `app/(app)/alertas-stock/client_page.tsx` | NEW | ~170 | Tabla con filtros, badge severidad, acciones |
| 3 | `components/TopNav.tsx` | EDIT | +5 | Link `/alertas-stock` en dropdown Bodega, visible solo admin+bodeguero |
| 4 | `components/BottomNav.tsx` | EDIT | +5 | Link `/alertas-stock` en sheet Bodega, visible solo admin+bodeguero |

**Total: ~190 líneas. Bajo 200.**

---

## Diseño

Tokens aplicados (mapeados a Tailwind vía config existente del proyecto):

| Elemento | Token design | Implementación |
|----------|-------------|----------------|
| Wrapper tabla | neutral-primary-soft bg, radius 24px, border-default | `bg-white dark:bg-zinc-900 rounded-3xl border shadow-sm` |
| Table head | neutral-secondary-soft bg, body color 14px medium | `bg-zinc-50 dark:bg-zinc-950/50 text-sm font-medium` |
| Badge severidad (verde) | success variant | `bg-green-100 text-green-700 border-green-200` |
| Badge severidad (amarillo) | warning/brand-soft | `bg-amber-100 text-amber-700 border-amber-200` |
| Badge severidad (rojo) | danger-soft | `bg-red-100 text-red-700 border-red-200` |
| Botón Ignorar | outline variant | `variant="outline" size="sm"` |
| Botón No reponer | ghost danger | `variant="ghost" size="sm" text-red-500` |

---

## Diff propuesto

### Archivo 1: `app/(app)/alertas-stock/page.tsx`

Server component — obtiene datos iniciales y renderiza el client component:

```tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AlertasStockClient } from "./client_page";

export default async function AlertasStockPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <AlertasStockClient />;
}
```

### Archivo 2: `app/(app)/alertas-stock/client_page.tsx`

Client component con:
- `useAlertas()` del contexto para el badge count
- Fetch a `GET /api/alertas-stock/lista` al montar
- Tabla con columnas: Código, Detalle, Saldo, Stock Mínimo, Déficit, Severidad, Acciones
- Badge de severidad calculado: `deficit / stock_minimo` → `<25%` verde, `25-50%` amarillo, `>50%` rojo
- Botón "Ignorar" → `PUT /api/alertas-stock/{producto_id} { accion: "ignorar" }` → `refreshStockBajo()` del contexto
- Botón "No reponer" → `PUT /api/alertas-stock/{producto_id} { accion: "no_reponer" }` → recargar lista
- Acceso: admin y bodeguero (el backend ya rechaza vendedor con 401, la UI muestra mensaje si recibe 401)
- Estado vacío: "No hay productos bajo stock mínimo" cuando la lista viene vacía
- Loading: skeleton o spinner mientras carga

### Archivo 3: `components/TopNav.tsx`

Agregar después de `/bodega/registro-notas` (línea 146), dentro del bloque Bodega pero con **condición propia restringida** (`isAdmin || rol === 'bodeguero'`), no heredando la del bloque padre (`isAdmin || rol === 'bodeguero' || rol === 'vendedor'`):

```tsx
{(isAdmin || rol === 'bodeguero') && (
  <Link href="/alertas-stock" className="flex items-center gap-2 w-full">
    <AlertTriangle className="w-4 h-4" />
    <span>Alertas de stock</span>
    {stockBajoCount > 0 && (
      <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0">
        {stockBajoCount}
      </Badge>
    )}
  </Link>
)}
```

Requiere importar `useAlertas` desde `@/contexts/AlertasContext` y `AlertTriangle` desde `lucide-react`.

### Archivo 4: `components/BottomNav.tsx`

Mismo link, misma restricción (`isAdmin || isBodeguero`), después de `/bodega/registro-notas` (línea 143):

```tsx
{(isAdmin || isBodeguero) && (
  sheetLink('/alertas-stock', <AlertTriangle className="w-5 h-5" />, 'Alertas de stock', () => setBodegaOpen(false))
)}
```

Requiere importar `AlertTriangle` desde `lucide-react`. No necesita `useAlertas` — el badge count se puede omitir en mobile (el sheet se cierra al navegar).

---

## Fuera de scope

| Ítem | Motivo |
|------|--------|
| UI para configurar `stock_minimo` por producto | Se setea directo en DB; requiere editor de producto |
| Filtros avanzados (por código, por severidad) | MVP mínimo |

---

## Criterio de éxito

```
npx tsc --noEmit    # 0 errores nuevos
npm run test        # sin regresiones
```

---

## Resumen

| Métrica | Valor |
|---------|-------|
| Archivos | 4 (2 nuevos, 2 edit) |
| Líneas | ~213 (estimado: 190; +23 por estados loading/error/empty exigidos por tests Fase B) |
| Impacto lateral | TopNav+BottomNav +5 líneas cada uno, AlertasContext ya conectado, vendedor no ve el link |

**Nota de cierre:** 213 líneas implementadas vs 190 estimadas. La diferencia (+23 líneas)
viene de los estados `loading`/`error`/`empty` en `client_page.tsx` que los tests de Fase B
(R1, R3a/R3b, R4, R5) exigían explícitamente — no scope creep. Se acepta sin re-división.
