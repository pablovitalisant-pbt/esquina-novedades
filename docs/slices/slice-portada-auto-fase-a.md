# Fase A — Slice `portada-auto`: portada automática de la tienda

Estado: **contrato aprobado por el Product Owner.** Flag `tienda-portada-auto`
en `false`: con OFF la portada renderiza exactamente como hoy.
Fecha: 2026-10-31.

Datos reales (verificados): 69 productos, `fecha_ingreso` en 68 con el mismo
minuto, `categoria` NULL en 69, 0 `imagen_url`, 0 `minimo_mayor`, 2 con stock.
El diseño asume esto: 0 categorías → sin secciones de categoría, banner con el
texto fijo, y el desempate por `id DESC` es el único orden útil hoy.

## 1. Contrato

1. **Novedades automático**: 12 productos con stock, `MAX(fecha_ingreso) DESC`,
   desempate `id DESC` siempre. `es_nuevo=true` (Destacar) primero.
   `ProductoTienda` gana `fecha_ingreso: string | null` (ISO desde SQL; sin
   migración).
2. **`es_nuevo` = "Destacar"**:
   2a. `POST /api/productos` inserta `es_nuevo = false` por defecto; si el body
   trae `es_nuevo` boolean, se respeta.
   2b. `ProductDrawer`: check "Destacar en la tienda" (solo admin) que edita vía
   el endpoint de producto; badge del drawer pasa a "Destacado".
   2c. Badge de `TarjetaProductoTienda`: con flag ON depende de la prop
   `mostrarNuevo`, no de `es_nuevo`. En `/catalogo/[slug]` no se pasa la prop →
   sin NUEVO. Con flag OFF, comportamiento actual (`es_nuevo`).
3. **Una sección por categoría con stock** (categoría no nula, derivada de los
   productos), orden por cantidad desc, desempate nombre asc. Carrusel con los
   10 más recientes (orden 1) + "Ver todos" que hace `setCategoria` y scroll a
   `#grilla-productos`. Categorías sin productos con stock no aparecen.
   Productos sin categoría: solo en Novedades y en la grilla "Todos".
4. **"Ahorra comprando por mayor"**: `puedeVenderMayor(p)` y
   `minimo_mayor` entero > 0. Oculta si no hay ninguno. Precio sigue siendo por
   menor; nota "Desde N unidades: descuento especial".
5. **Destacados del banner**: 3 más recientes (orden 1) con `imagen_url` primero.
6. **Texto del banner**: nombres de categorías con stock (máx. 3, orden 3) +
   " y más · Por mayor y por menor". Sin categorías: texto fijo actual con
   tilde.
7. `/catalogo/[slug]`: sin cambios; 2c aplica de forma automática.

Se mantienen buscador, chips, select de orden, grilla "Todos" y regla de precio.
Toda la lógica de armado vive en `components/tienda/portada-auto.ts` (función
pura con tests unitarios), no en el JSX.

## 2. Revisión de impacto lateral

| Archivo | Cambio | Justificación |
|---|---|---|
| `lib/tienda-productos.ts` | `fecha_ingreso` en tipo y SQL | contrato 1 |
| `components/TarjetaProductoTienda.tsx` | prop `mostrarNuevo` + flag | contratos 2c |
| `components/TiendaPortada.tsx` | secciones, banner, badge, ver todos | contratos 1,3-6 |
| `app/api/productos/route.ts` | `es_nuevo=false` default | 2a |
| `components/ProductDrawer.tsx` | check Destacar (admin), badge "Destacado" | 2b |
| `config/feature-flags.json` | `tienda-portada-auto: false` | flag |
| `__tests__/slice8a-tienda-portada.test.tsx` | fixture `fecha_ingreso: null` | tipo requerido |
| `__tests__/tienda-modalidad.test.tsx` | fixture ya no tipado; sin cambio de lógica | verificación |
| `app/page.tsx` | **ninguno**: ya usa `getProductosTienda` | — |
| `app/catalogo/[slug]/*` | **ninguno**: no se pasa `mostrarNuevo` | 2c/7 |

No hay migración (`fecha_ingreso` ya existe en `003_core_tables.sql:48`).
El endpoint de producto no tiene PATCH; se usa el PUT existente (whitelist
incluye `es_nuevo`), mismo efecto y un endpoint menos.

## 3. Fase B — riesgos mínimos (un test cada uno)

0 categorías → sin secciones + banner fijo; categoría sin stock oculta;
novedades con fecha empatada desempata por id; producto sin `fecha_ingreso` va
al final; sin productos por mayor → sección oculta; destacados sin fotos → 3;
destacados priorizan con foto; producto sin categoría no aparece en secciones;
POST crea `es_nuevo=false`; flag OFF = render actual; smoke de portada completa.

## 4. Sub-slices

Implementación estimada < 200 líneas → un solo slice.
