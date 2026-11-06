# N09 — Lista de precios desde la primera página

DT aprueba por delegación. /precios muestra los productos activos de las empresas permitidas desde que se abre. Orden estable por código agrupado, páginas de 50 y botón Cargar más. Búsqueda y filtros reinician cursor; respuestas anteriores no sustituyen resultados nuevos. Conservar crear y editar producto.

N09a files-to-touch app/api/productos/route.ts, config/feature-flags.json y nuevo test GET paginado. Con flag precios-paginados y paginado=true, cursor opcional por código. El SQL aplica p.codigo > cursor antes de agrupar, mantiene filtros/roles, LIMIT 51, devuelve 50 y siguienteCursor solo cuando queda otra página. Sin opt-in o flag off conserva {data} y LIMIT 200 para POS y otros consumidores. Prueba de orden y recorrido con DB TEST, búsqueda/filtros y legado. Sin schema ni permisos nuevos.

N09b files-to-touch app/(app)/precios/client_page.tsx y pruebas de esa página. Inicial sin búsqueda de dos letras, debounce existente, botón Cargar más, abort/guard para respuestas tardías y estado de error. No duplicar código ni restaurar cursor viejo al cambiar filtros. Smoke en navegador con más de una página. Máximo 200 líneas por corte.
