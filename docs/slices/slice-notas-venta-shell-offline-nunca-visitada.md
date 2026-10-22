# Fase A — Shell offline para notas de venta nunca visitadas

## Objetivo

Que `/notas-venta/[id]` muestre el contenido de la nota offline **aunque
esa nota específica nunca se haya abierto antes con conexión** — hoy solo
funciona si esa URL exacta ya fue visitada y quedó en el cache "pages"
del service worker.

## Diagnóstico (evidencia, no hipótesis)

`app/sw.ts` cachea navegaciones con `NetworkFirst` por **URL exacta**
(cache `"pages"`). Si `/notas-venta/61` nunca se visitó, no hay entrada
para esa URL → falla la red (offline) → cae al fallback genérico
`/offline`, sin importar que la nota #61 ya esté sincronizada en el
SQLite local vía PowerSync.

`app/(app)/notas-venta/[id]/page.tsx` (server component) NO hace ninguna
consulta a Postgres específica del `id` — solo valida sesión/rol
(`getServerSession`, `RUTAS_POR_ROL`) y pasa `params` sin tocar datos.
Todo el contenido real de la nota (título, items, cliente, saldo) se
arma client-side en `[id]/client_page.tsx` vía `fetchPrenota()`,
consultando PowerSync local. Esto es clave: el HTML que Next.js
server-renderiza para CUALQUIER nota es idéntico en estructura (mismo
shell "cargando..." antes de que `fetchPrenota()` resuelva) — no hay
dato específico del id embebido en el SSR actual.

## Cambios

### 1. `app/(app)/notas-venta/[id]/client_page.tsx`

`PrenotaDetalleContent` deja de tomar el `id` del prop `params` (que
viene horneado en el HTML que el service worker pueda haber cacheado
para OTRA nota) y lo toma de `useParams()` (`next/navigation`), que lee
el segmento real de la URL del navegador en el momento del render
cliente — así el contenido siempre corresponde a la URL que el usuario
está viendo, sin importar qué HTML sirvió el service worker.

```tsx
import { useParams } from 'next/navigation';
// ...
function PrenotaDetalleContent({ session }: { session: any }) {
  const params = useParams();
  const id = params.id as string;
  // resto sin cambios
}
```

`PrenotaDetallePage` deja de requerir/reenviar `params` a
`PrenotaDetalleContent` (ya no lo necesita); puede seguir recibiéndolo
de `page.tsx` sin usarlo, o `page.tsx` puede dejar de pasarlo — decisión
de Claude Code, lo que genere el diff más chico.

### 2. `app/sw.ts`

Nuevo handler de navegación, específico para `/notas-venta/`, ANTES del
handler genérico de navegación (Serwist/Workbox usa first-match):

Comportamiento exacto (verificar contra la API real de `serwist`
instalada — `node_modules/serwist` — antes de implementar; no asumir
que existe un handler funcional tipo Workbox `registerRoute` con
función; si `serwist` no lo soporta igual, usar una subclase de
`Strategy` con `_handle` custom, lo que la librería realmente permita):

1. Intentar red con timeout corto (2-3s, no los 10s del handler
   genérico — evita colgar la UI mucho tiempo si el usuario está
   realmente offline).
2. Si la red responde bien → cachear en `"pages"` con la URL exacta (
   igual que hoy) y devolver esa respuesta.
3. Si la red falla → buscar en el cache `"pages"` la URL exacta primero
   (por si esa nota específica sí se visitó antes).
4. Si no está → buscar en el cache `"pages"` CUALQUIER entrada cuyo
   pathname empiece con `/notas-venta/` y tenga un segmento después
   (excluir la lista `/notas-venta` sin id) → servir esa como shell
   genérico.
5. Si tampoco hay ninguna (el usuario nunca visitó ninguna nota con
   conexión) → fallback a `/offline`, como hoy.

## Revisión de impacto lateral (obligatoria)

- **`page.tsx`** — sigue haciendo el chequeo de sesión/rol igual que
  hoy; ese chequeo solo se ejecuta cuando la petición realmente llega al
  servidor (con red). Cuando se sirve el shell cacheado de otra nota, no
  hay round-trip al servidor — la seguridad de la ruta la sigue dando el
  middleware + PowerSync (que solo tiene datos del usuario ya
  autenticado sincronizados localmente). No se debilita nada.
- **Otros módulos con el mismo patrón** (Caja Mayor detalle, Bodega,
  etc. si los tienen) — probablemente tienen el mismo problema, pero
  **no están en el alcance de este slice**. Pablo pidió específicamente
  notas de venta. Se anota como hallazgo para decidir después si se
  generaliza el fix del service worker a otros prefijos de ruta.
- **`app/offline/page.tsx`** (si existe) — no se toca, sigue siendo el
  fallback final.
- **Tests existentes de `sw.ts`** (si los hay) — revisar si hay que
  actualizar mocks del cache "pages".

## Riesgo de hidratación (Fase B lo cubre con test, acá solo se declara)

Servir el HTML de la nota A para la URL de la nota B implica que React
va a hidratar sobre un DOM que el servidor generó para A. Como el SSR
actual no embebe datos específicos del id (confirmado arriba — todo
carga vía `useEffect` + PowerSync después del mount), el markup inicial
debería ser idéntico para cualquier id (mismo esqueleto "cargando"). Si
esto no es 100% cierto en algún detalle (ej. algún texto que sí varía
en el server-render), va a haber un warning/error de hidratación de
React — Fase B debe incluir un test que lo cubra explícitamente.

## Ejemplos

- Nota #61 sincronizada localmente, nunca visitada con conexión,
  dispositivo offline, pero SÍ visitó antes `/notas-venta/54` con
  conexión → navegar a `/notas-venta/61` debe mostrar el contenido real
  de la nota #61 (no `/offline`, no el contenido de la #54).
- Dispositivo que nunca visitó NINGUNA nota con conexión, offline →
  `/notas-venta/61` debe mostrar `/offline` (no hay shell que servir,
  comportamiento actual, sin cambios).
- Con conexión → comportamiento idéntico a hoy en todos los casos.

## No se toca

- La lógica de negocio de `fetchPrenota()` / PowerSync — ya funciona
  bien una vez que el shell carga.
- El resto de `runtimeCaching` en `sw.ts` (API, `defaultCache`, etc.).
- Otros módulos offline — solo `/notas-venta/[id]`.

---

Pendiente de tu aprobación antes de pasar a Fase B (análisis de riesgos
+ tests).
