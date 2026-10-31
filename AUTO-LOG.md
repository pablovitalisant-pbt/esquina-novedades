# AUTO-LOG — modo autónomo (PBT-IA-AUTO)

Una entrada por slice. Programador: `claude-deep` (DeepSeek v4 flash) vía PowerShell headless. Director Técnico verifica cada resultado con comandos propios.

## 2026-10-23 - Slice: A1 documentación desfasada
- Contrato: PRD §8.4 (rechazo no libera stock), §9 slices 0/9/10/11, CONTEXT estado + contador.
- Tests: n/a (solo docs). Hecho por el Director Técnico.
- Commit: 637188a
- Gates disparados: ninguno

## 2026-10-23 - Slice: A2 ponytail audit + limpieza
- Contrato: audit de lo cambiado desde f097823; aplicar hallazgos verificados.
- Tests: suites tocadas 7/7 (81 tests) verdes; next-config 2/2; tsc 108 = línea base; suite completa = 5 suites heredadas.
- Verificación DT: claude-deep reportó "tsc sin errores en código fuente" pero el hallazgo 6 subía tsc a 134 (+26 en tests) y rompía next-config.test → revertido el 6 y ajustado el test. Hallazgo 5 rechazado (evidencia incompleta).
- Commit: b6ef44c
- Gates disparados: ninguno
## 2026-10-23 - Slice: A3 validación de env al arrancar
- Contrato: lib/env.ts (requeridas, de pago según flag tienda-pago-online, opcionales Cloudinary) + instrumentation.ts (solo nodejs, flag env-validacion-arranque). Loguea nombres faltantes, nunca valores; no tumba la app.
- Tests: 10 nuevos (rojo verificado por módulo inexistente → verde); suite completa = línea base; tsc 108; build OK.
- Verificación DT: claude-deep reportó "184 errores preexistentes" en tsc; medido por el DT: 108 (dato falso, sin impacto en el código).
- Commit: 86dcecf (flag off) + 19cfce6 (flag on)
- Gates disparados: ninguno. Pendiente verificar el log de arranque en producción tras el push.

## 2026-10-23 - Slice: A4a tests-script a módulos
- Contrato: `export {};` en 19 tests sin import/export (scope global → TS2451/TS2393).
- Tests: tsc 108 → 39 (medido por DT); diff verificado: solo +19 líneas `export {};`.
- Commit: 6fad760
- Gates disparados: ninguno
## 2026-10-23 - Slice: A4b tsc a cero
- Contrato: solo cambios de tipos en tests (sin tocar aserciones) + mover `getCatalogData` de la página a `app/catalogo/[slug]/data.ts` (export no permitido en páginas de Next).
- Tests: tsc 39 → 0; suite completa = línea base (mismas 5 suites); build OK. DT verificó: movimiento literal (134 líneas, 0 diferencias), diff de tests solo casts/anotaciones + 1 prop de fixture exigida por el tipo.
- Verificación DT: claude-deep listó mal las suites en rojo (nombró productos-softdelete, que pasa).
- Commit: 92136ac
- Gates disparados: ninguno
## 2026-10-23 - Slice: A5 build estricto
- Contrato: quitar `ignoreBuildErrors`/`ignoreDuringBuilds`; lint 0/0. Decisión DT: `no-explicit-any` off (385 `any` heredados en 99 archivos → deuda A11 en el backlog); `no-require-imports` off solo en tests (patrón jest.mock + require).
- Tests: lint 0 errores / 0 warnings; tsc 0; suite completa = línea base; `npm run build` con lint y tipos activos OK, sin warnings.
- Verificación DT: revisados los 3 cambios de dependencias de hooks (fetch inicial duplicado eliminado; `categoriaFiltro` en el observer corrige closure obsoleto; `onAutoFocusConsumed` protegido por ref). 4 `eslint-disable-next-line no-img-element` con motivo (previews locales / thumbnail recharts).
- Commit: 1753b3c
- Gates disparados: ninguno
## 2026-10-23 - Slice: A6 fixtures de test-integration + tests desactualizados
- Contrato: diagnóstico por suite (13 F falta de datos, 5 T tests desactualizados, 0 B); seed idempotente `npm run test:seed` con safeguard anti-producción; tests ajustados sin cambiar qué verifican.
- Tests: suite completa 212/212 suites, 1775/1775 tests (primera vez 100 %); tsc 0; lint 0/0; build OK.
- Verificación DT: labels de UI confirmados contra el código; script revisado (carga .env.test, assertEnvTestExiste + assertNoProduccion antes de conectar).
- Commit: f600207
- Gates disparados: ninguno

## 2026-10-23 - A8 zonas de riesgo + A10 diff de env (DT, solo docs)
- PRD "Zonas de riesgo conocidas" completado (webhook/BUG-005, IPN legacy, reserva BUG-003, precio catálogo, flags en tests, env).
- `docs/audits/env-diff-2026-10-23.md`: producción tiene todas las requeridas; faltan Cloudinary (C2) y credenciales MP productivas (C4), planificados.
## 2026-10-23 - Slice: A7 precio de catálogo en CLP entero
- Contrato: `precioCatalogoBase` = `Math.ceil(costo * (1 + margen/100))` (antes ceil a 1 decimal, herencia USD).
- Tests: nuevo test rojo (esperaba 1235, recibía 1234.5) → verde; suite completa 213/213, 1778/1778; tsc 0; lint 0/0; build OK.
- Verificación DT: corrección del diagnóstico del DT: NO había descuadre con MP (el servidor ya hacía `Math.round` al cobrar y la UI mostraba entero). Efecto real del cambio: precios de catálogo redondean hacia arriba al peso (hasta +$1 en algunos productos, p. ej. 129,4 → 130). Informado a Pablo.
- Commit: 4da4d10
- Gates disparados: ninguno
## 2026-10-23 - A9 smoke E2E (DT, solo lectura en producción)
- Público: home, /productos, /login, /pedido (200/404), API de entrega; pago MP verificado con pagos reales.
- Staff (sesión de Pablo): notas de venta (lista y detalle), precios (búsqueda), clientes, caja mayor, bodega, ingresos, deudores, pedidos, alertas de stock, kardex (deshabilitado a propósito), catálogos, usuarios, categorías, caja-config, inversión en mercadería. Sin errores.
- Hallazgos: (1) nota #1 no incluye el costo de entrega ($3.000) que sí está en el pedido y en el cobro de caja → A12, decisión de producto. (2) Productos DEMO con categoría en texto sin filas en `categorias` (dato de demo; se borra en C6).
- Gates disparados: A12 (decisión de producto).
## 2026-10-23 - Slice: A12 línea Despacho en la nota (decisión de Pablo: opción a)
- Contrato: al convertir, si entrega_costo > 0 se agrega a prenota_items una línea DESPACHO (empresa_id NULL → fuera de todo join de stock), en la misma sentencia atómica (idempotente). tipo/etiqueta de la nota la ignoran.
- Tests: 7 rojos → 42/42; validación contra Postgres real (BEGIN…ROLLBACK en test-integration): 1ª conversión 2 filas (ítem + DESPACHO 3000, empresa NULL), 2ª 0 filas nuevas. La prueba real detectó un bug de tipos en el UNION ALL (NULL inferido como texto) que los mocks no veían → corregido con casts.
- Verificación DT: rechacé la primera versión (sentencia SQL duplicada de ~30 líneas para facilitar el mock) → una sola sentencia.
- Commit: 5405cc0
- Gates disparados: ninguno. Nota #1 (pedido afb8e9f4) no se corrige: es dato de prueba y se borra en C6.

## 2026-10-23 - Slice: C6 script de limpieza para el go-live
- Contrato: scripts/limpiar-datos-prueba.ts, dry-run por defecto, --host obligatorio igual a DATABASE_URL, una transacción con guards, DELETE siempre con WHERE sobre listas explícitas. 222 líneas (excede 200; aceptado por ser script aislado y repetitivo).
- Tests: 5/5. Dry-run en PRODUCCIÓN (solo COUNT): 3 pedidos, 4 pedido_items, 3 notas, 4 ítems, 3 vínculos y 3 cobros de caja, 2 clientes, 5 productos — cuadra con lo esperado.
- Commit: 28cb0eb
- Gates disparados: ejecutar con --ejecutar queda para el go-live (C6), con respaldo previo.

## 2026-10-23 - Slice: C1 branding centralizado
- Contrato: lib/empresa.ts con logo/logoNota (null → wordmark actual), redes (vacías → no se muestran), colores; MarcaLogo y RedesSociales; app/manifest.ts reemplaza public/manifest.json; íconos copiados a public/marca/; borrados public/logo-*.png sin referencias (restos de Bazar Naty).
- Tests: 106/106 tocados; suite completa verde; build OK con /manifest.webmanifest enlazado automáticamente.
- Verificación DT: corregí 2 desviaciones: purpose de íconos ("any maskable" se había reducido a "maskable" → ahora dos entradas any + maskable) y layout.tsx seguía apuntando a /manifest.json borrado (404) → quitado; Next enlaza /manifest.webmanifest (verificado en el HTML del build).
- Commit: e2511ac
- Gates disparados: ninguno.
## 2026-10-23 - Slice: A11 sin `any` en código de producción (5 sub-slices)
- Contrato: eliminar los 386 `any` explícitos de producción sin cambiar comportamiento; tests siguen permitiéndolos (mocks). Al final reactivar `no-explicit-any` para producción.
- Sub-slices: A11-1 app/api/caja (85→0) `82b1582` · A11-2 notas-venta/pedidos/mercadopago (78→0) `78f3424` · A11-3 resto de app/api (119→0) `faed8fb` · A11-4 app/(app), componentes, lib, hooks, middleware, scripts (132→0) `4dd05a3` · A11-5 regla reactivada `95eee88`.
- Tests: suite completa 215/215 suites, 1799/1799; tsc 0; lint 0/0 con la regla activa; build estricto OK. Sin `as unknown as` (verificado con grep en el diff).
- Verificación DT: revisé las líneas removidas sin patrón de tipo (68 en app/api, 25 en el resto): todas eran reescrituras de tipos (String(), !, anotaciones). Excede el límite de 200 líneas por sub-slice (+797/−382 en app/api, +340/−153 en el resto) porque tipar agrega interfaces; aceptado y registrado.
- Hallazgo: `app/api/catalogos/public/[slug]/route.ts` tenía otra copia de la fórmula de precio con 1 decimal (A7 incompleto) → corregido con `precioCatalogoBase` en `3b07c20`.
- Gates disparados: Señal 2 (más de 5 slices desde el audit del 2026-10-23) → ponytail audit a continuación.
## 2026-10-23 - Señal 2: ponytail audit 2026-10-23b + limpieza
- Audit de lo cambiado desde b6ef44c: 8 hallazgos (duplicación que dejó A11: guards admin, usuarioSesion, mensajeError).
- Limpieza: aplicados 1–6 y 8 (neto ≈ −130 líneas); 7 rechazado. Nuevos `lib/errores.ts`, `lib/session.ts`, `requiereAdmin` en `app/api/caja/_types.ts`.
- Tests: suite completa 215/215, 1799/1799; tsc 0; lint 0/0; build OK.
- Verificación DT: mensajes de error y status HTTP idénticos (comparé los literales removidos vs agregados del diff; los 2 sin equivalente directo ahora se pasan como parámetro a `requiereAdmin`); 401 sin sesión / 403 no admin igual que antes.
- Commit: (este)
- Gates disparados: ninguno. Contador de slices desde el audit: 0.
## 2026-10-26 - Go-live: dominio, Mercado Pago producción, limpieza e importación
- Dominio laesquinadelasnovedades.store activo; NEXTAUTH_URL / NEXT_PUBLIC_SITE_URL actualizados.
- MP producción: app 8021659669573211 (cuenta La Esquina), webhook Modo productivo; pago real $2.490 convertido con nota y cobro.
- C6 ejecutado: base en cero (respaldo en ~/.pbt-runner/respaldo-golive-2026-10-26.json).
- Importación: 68 productos desde "VENTAS AL DETALLE.xlsx" Hoja2 (script fuera del repo, ~/.pbt-runner/import-*.cjs), stock 0. Correcciones de Pablo: fila 70 MBC precio mayor 333 c/u; fila 71 detalle 10.000 / mayor 6.500. Excluidas: fila 26 (vendido), 61, 62, 73, 74 (sin precio), 75, 76 (sin código). 4 con precio mayor $0 importados sin precio mayor (filas 28, 35, 36, 37). Filas excluidas marcadas en rojo en el Excel de OneDrive.
- Gates disparados: A13 (cambio de modelo de precio mayorista) requiere ciclo PBT-IA con contrato aprobado.## 2026-10-29 - Hotfix P0: precio mayor bloqueado en la tienda online
- Decisión de Pablo/Paola (2026-10-29): en notas el vendedor elige detalle o mayor por línea (cualquier cantidad); la tienda online muestra solo precio detalle y aplicará el mayor como descuento automático desde `minimo_mayor` por producto (slice posterior).
- Contrato: flag `tienda-mayor-online=false` → POST /api/pedidos rechaza `modalidad:'caja'` con 400 antes de cualquier SQL; `calcularLinea` igual (defensa); sin botón Caja en tienda/catálogos; el carrito guardado descarta líneas caja al hidratar. Notas de venta sin cambios.
- Tests: 8 nuevos (hotfix-tienda-mayor-*), rojos 6/8 antes de implementar; 5 tests de tienda ajustados al bloqueo. Suite 218/218, 1806/1806; tsc 0; lint 0/0; build OK.
- Verificación DT: diff revisado línea a línea; verificación completa ejecutada por el DT (no se usó el reporte de claude-deep).
- Gates disparados: ninguno.
## 2026-10-29 - Slice 2: precios directos en productos (2a servidor + 2b UI)
- Decisión de Pablo: al crear/editar producto se ingresan precio detalle y precio mayor directo; el % de ganancia lo deriva el servidor desde el costo; costo obligatorio al crear. Nuevo `minimo_mayor` (unidades para precio mayor en tienda online).
- Contrato: migración 045 (`productos.minimo_mayor`); `calcularMargen` reemplaza `calcularPrecio`; POST exige prcventa entero; PUT nunca recalcula prcventa desde costo; precio_mayor < prcventa; minimo_mayor requiere precio_mayor. UI de crear/editar sin % editable, ganancias en vivo. Al editar el costo es opcional (68 productos sin costo) — decisión DT, reversible.
- Tests: 2a 49 rojos antes; 2b 17 rojos antes. Suite 220/220, 1847/1847; tsc 0; lint 0/0; build OK.
- Verificación DT: diff revisado; producción sin productos con mayor >= detalle ni precios con decimales (SELECT de solo lectura). 045 aplicada en test-integration y en producción antes del push (idempotente, verificada). `npm run migrate` falla en test-integration en 019 (no idempotente; preexistente, no de este slice).
- Gates disparados: excede 200 líneas (~300 prod) porque servidor y UI deben desplegarse juntos; aceptado.
## 2026-10-29 - Slice 3: modalidad detalle/mayor elegida por el vendedor (3a servidor + 3b UI)
- Decisión de Pablo/Paola: en notas el vendedor elige por línea detalle (prcventa) o mayor (precio_mayor por unidad), cualquier cantidad. No existe venta por caja; cantcaja solo bodega.
- Contrato: migración 046 (modalidad 'detalle'|'mayor' en prenota_items y pedido_items, valores migrados, subtotal = unidades*precio); POST/PATCH items con modalidad mutable y precio por defecto según modalidad; tipo de nota y etiqueta de cliente con valores nuevos; propagación de precios por modalidad; convertir copia modalidad y corrige bug legacy (cantidad*cantcaja); tienda sigue bloqueando mayor (flag). UI de notas, modal, PDF/Excel/WhatsApp, pedidos y landing sin cajas.
- Tests: 3a 32 rojos antes; 3b suite nueva + 8 ajustadas. Suite 222/222, 1901/1901; tsc 0; lint 0/0; build OK.
- Verificación DT: diff revisado (migración idempotente, rutas de items, pantalla de notas); 046 aplicada en test-integration y en producción justo antes del push (sin usuarios activos, OK de Pablo).
- Gates disparados: ~230 líneas netas de producción (servidor y UI deben desplegarse juntos); aceptado.
## 2026-10-29 - Slice 4: catálogos con precio detalle + descuento por mayor automático en tienda (4a/4b/4c)
- Decisiones de Pablo: catálogos usan prcventa (se elimina el % sobre costo; los precios especiales por producto del catálogo se mantienen); tienda muestra solo precio detalle y aplica precio mayor como "Descuento especial" cuando la cantidad del producto llega a `minimo_mayor`; flag `tienda-mayor-online` encendido en el mismo deploy.
- Contrato: 4a `precioEnCatalogo(prcventa, override)` única fuente (página pública y cobro); POST/PUT de catálogos sin margen_precio (columna queda sin uso). 4b `lib/precio-tienda.ts` puro; el servidor decide modalidad por cantidad total por producto; migración 047 `pedido_items.precio_lista`; preferencia MP con "precio especial por mayor". 4c sin SelectorModalidad; carrito una línea por producto con normalización de carritos viejos; descuento en carrito y página del pedido.
- Tests: 4a 28 rojos antes; 4b 14 + 5 archivos rojos antes; 4c 10 rojos antes. Suite 225/225, 1925/1925 (con flag true re-verificada); tsc 0; lint 0/0; build OK.
- Verificación DT: diff revisado por sub-slice; 047 aplicada en test-integration y en producción (Pool, transacción) antes del push.
- Hallazgo: `catalogo-precio-override` T6 intermitente con la BD de test real (probable concurrencia con el test real de 4a que crea productos) → BACKLOG A15.
- Lección: migraciones con varias sentencias se aplican con Pool (WebSocket); el driver HTTP de neon no acepta multi-statement.
## 2026-10-29 - Señal 2: ponytail audit 2026-10-29 + limpieza
- Audit de lo cambiado desde c5fe864: 11 hallazgos (`docs/audits/ponytail-audit-2026-10-29.md`).
- Limpieza: aplicados 1-9 y 11 (código neto −152; con test de equivalencia ≈ −50). Rechazados los DROP de `pedido_items.precio_referencia` y `catalogos.margen_precio` (destructivos, sin beneficio).
- Hallazgo de seguridad del DT (preexistente): la página pública del catálogo enviaba `costo` de cada producto al navegador (payload RSC). Corregido; test exige que no exista `costo` en data.ts ni en el API público.
- Tests: 226/226, 1925/1925; tsc 0; lint 0/0; build OK (verificado por el DT).
- Gates disparados: ninguno. Contador de slices desde el audit: 0.
## 2026-10-29 - Slice 5: textos POR MAYOR / POR MENOR
- Pedido de Pablo: toda referencia visible a precios mayoristas dice "Por mayor" y a detalle "Por menor" (pastillas/selectores en mayúsculas). Valores internos ('detalle','mayor','menor','mixta') sin cambios; Caja Mayor y bodega intactos; etiquetas de cliente y "Descuento especial" sin cambios.
- Tests: 12 rojos antes; suite 227/227, 1937/1937; tsc 0; lint 0/0; build OK (verificado por el DT).
## 2026-10-29 - Slice 6: paleta de La Esquina de las Novedades + modo oscuro legible
- Base: DNA de marca de Paola (violeta noche #21002F, morado #590078, oro #F2B936, champagne, blanco cálido; fucsia solo acentos). Tokens claro/oscuro en globals.css; oscuro con fondo/tarjeta/panel/borde/input diferenciados; 16 clases de color fijas reemplazadas por tokens; empresa.ts y manifest con colores de marca.
- Tests: 6 rojos antes (tokens, contraste WCAG por pares, clases fijas). Suite 228/228, 1953/1953; tsc 0; lint 0/0; build OK (verificado por el DT).
- Verificación visual DT: build servido localmente contra la BD de test (usuario QA y 6 productos QA-* creados solo en test-integration), revisado en claro y oscuro (login, precios, tienda, notas). Encontrado y corregido: texto oscuro sobre degradado violeta en oscuro y botón secundario fucsia → texto #FFF8EA y secundario dorado.
## 2026-10-29 - Slice 7: archivos generados con colores de marca
- PDF y Excel de notas, Excel de Caja Mayor, QR de catálogo e impresión usan EMPRESA.colores (+ tokens de archivo y helpers hexToRgb/hexToArgb). Sin colores de la paleta vieja en generadores (grep verificado por el DT).
- Tests: 8 rojos + 1 suite antes; suite 230/230, 1968/1968; tsc 0; lint 0/0; build OK (verificado por el DT).
## 2026-10-29 - Slice 8 (8a/8b/8c): nueva portada de la tienda tras flag tienda-portada-v2 (false)
- Pedido de Pablo: rehacer la página pública tomando lo mejor de Amazon, AliExpress, Temu y SHEIN. Revisadas por el DT en el navegador: Temu (franja de beneficios, buscador central, franja de confianza, ofertas), Amazon (buscador con categorías, tarjetas temáticas), SHEIN (banner de campaña con productos, grilla de categorías, módulos). AliExpress bloqueó con captcha (no resuelto por política). Base de identidad: DNA de Paola.
- Contrato: "/" pasa a ser la tienda (franja de beneficios real desde opciones_entrega, header sticky con buscador y carrito, barra de categorías con stock, hero único sin carrusel, franja de confianza, Novedades, grilla con buscador/categoría/orden, tarjeta nueva con placeholder de marca, footer con "Acceso equipo"); /productos redirige a "/" (308); /catalogo/[slug] con el mismo diseño y precios del catálogo. Carrito, pedidos y MP sin cambios de lógica. Precio por mayor no se muestra (descuento en el carrito).
- Tests: 8a 3 suites rojas, 8b 2 rojas antes. Suite 235/235, 1991/1991 con flag false y con flag true (verificado por el DT); tsc 0; lint 0/0; build OK.
- Verificación visual DT (build local contra BD de test; usuario QA, 6 productos QA-*, 4 categorías y catálogo qa-navidad solo en test-integration): claro, oscuro y móvil 375px sin overflow. Encontrado y corregido: franja de beneficios en 4 líneas en móvil; 3 tests leían el flag real (BUG-004).
## 2026-10-29 - lim1: limpieza de la rama flag-off de la tienda (ponytail audit 2026-10-29b)
- Decisión DT: hallazgos 1–13 aplicados; rollback de la portada pasa a `git revert` (flag `tienda-portada-v2` se MANTIENE en el json, solo se borra la rama muerta); hallazgo 14 NO se aplica.
- Borrados: `components/LandingPage.tsx`, `app/productos/client_page.tsx` y 6 tests de la rama flag-off/grilla vieja. `/productos` queda `permanentRedirect('/')` incondicional; `/` monta siempre `TiendaPortada`.
- Shrinks: `ProductoTienda` sin `cantcaja`/`umed`; `ProductoTarjeta = Pick<...>`; `filtrarProductos` compartido; un solo `type Props` en `TiendaPortada`; `botonCategoria` sin export; CSS muerto fuera; ambos `href="/productos"` → `/`.
- Tests collateral ajustados (no listados en 13 pero obligados por el borrado): slice3b (caso LandingPage eliminado), slice2a-clp (lista), tienda-modalidad (reapuntado a TarjetaProductoTienda), slice6-paleta (aserto `.landing-page` fuera), slice8a-portada-page y productos-softdelete (ya no asumen `getProductosTienda` en `/productos`), slice8a-tienda-portada (tipo sin cantcaja/umed).
- Verificación: tsc 0; lint 0/0; jest 229/229 suites, 1913/1913 tests; build OK. Contador de slices desde el audit: 0.
## 2026-10-29 - logo1: logo oficial conectado (header, login, PDF)
- Assets de Pablo en public/marca: logo-320.webp (nav), logo-640.webp (login), logo-nota.png (PDF, jsPDF no acepta webp).
- empresa.ts: logo/logoGrande/logoNota con rutas reales. MarcaLogo: img con width 320 height 149 + decoding async; default h-10 w-auto. Tamanos: TopNav h-10, AppShell movil h-9, TiendaHeader h-10/h-12 (sm), pedido h-10, login h-24. max-w por header para no empujar botones.
- PDF nota: logo 30x14 mm (proporcion 400x186 ≈2.15) y razonSocial/direccion/ciudad bajados a y=31/36/41; fallback de texto si el fetch falla. No hay otros generadores con hueco de logo.
- Tests ajustados (asumian logo null): marca, slice-01-guard, appshell-smoke, nav-mvp, notas-venta-exportar-pdf (path del fetch + addImage), compartir-whatsapp, slice5cd. Nuevo test de proporcion ~2.15.
- Verificacion: tsc 0; lint 0/0; jest 229/229 suites, 1915/1915 tests; build OK.
## 2026-10-29 - pos1: TARJETA como forma de pago (POS v1, 1 de 4)
- Contrato POS v1 agregado a PRD.md (seccion "POS v1"): /pos para admin y vendedor, teclado+mouse/tactil, panel COBRAR, cliente de meson, slices pos1-pos4. Flag `pos-v1: false` (sin uso aun).
- pos1: `forma_pago` acepta `tarjeta` en la ruta pagar; dialogo PagarNotaDialog muestra "Tarjeta". Revision de impacto lateral: specs/tipos compartidos y Caja Mayor (registro, tabla y edicion) incluyen tarjeta con label "Tarjeta".
- Sin migracion: `caja_movimientos.forma_pago` es TEXT sin CHECK (verificado por grep en migrations/; el unico CHECK cercano es sobre estado de pedidos (044)). No se creo ni edito ninguna migracion.
- Tests: nuevo `__tests__/pos1-forma-pago-tarjeta.test.ts` (5; 4 rojos antes). Suite 230/230, 1920/1920; tsc 0; lint 0/0; build OK.
- Archivos: app/api/notas-venta/[id]/pagar/route.ts, components/PagarNotaDialog.tsx, app/(app)/caja-mayor/client_page.tsx, docs/specs/caja-mayor.spec.ts, config/feature-flags.json, PRD.md, AUTO-LOG.md.
## 2026-10-29 - pos2: página /pos (búsqueda + grilla + nota + atajos) (POS v1, 2 de 4)
- Contrato POS v1 §pos2. Ejecutado en dos fases verificadas: pos2a (página, búsqueda, grilla, nota con mouse) y pos2b (teclado + barra móvil/Sheet).
- Revisión de impacto lateral (archivos existentes que debían cambiar):
  - `app/api/productos/route.ts`: GET devuelve `MAX(p.categoria)` (chips) y ya no corta con `data: []` cuando `search` está vacío (grilla inicial). Sin queries de precio nuevas: se reutiliza la consulta existente.
  - `lib/rutas-por-rol.ts`: `/pos` agregado a admin y vendedor (bodeguero no; el middleware lo manda a `/bodega`).
  - `components/TopNav.tsx` y `components/BottomNav.tsx`: acceso visible solo con `pos-v1` y rol admin/vendedor.
- Nuevos: `app/(app)/pos/page.tsx` (flag off → redirect a `/notas-venta`; rol distinto → `/dashboard`) y `app/(app)/pos/client_page.tsx`.
- Reutiliza APIs existentes sin rutas nuevas: `POST /api/notas-venta` (solo al agregar el primer producto), `POST/PATCH/DELETE` de items, `GET /api/notas-venta/[id]` para refrescar, `GET /api/categorias`. Modalidad: el servidor fija `prcventa`/`precio_mayor` (igual que AgregarANotaVentaModal). MAYOR deshabilitado si el producto cargado no tiene `precio_mayor`; si el producto no está en la grilla el servidor rechaza.
- Nota en curso recordada en localStorage (`pos-nota-id`, try/catch); "Nueva venta" la borra. COBRAR abre el `PagarNotaDialog` existente como puente a pos3. Guardar/Imprimir navega a `/notas-venta/[id]`.
- Colores de marca por tokens existentes (`--primary`, `--card`, `--body`, `--destructive`) — sin clases fijas; botones de 48–64 px, texto lg/xl bold.
- Riesgos Fase B cubiertos: race doble click/Enter (ref de bloqueo + botones disabled: una sola nota y un solo ítem), código exacto vs búsqueda parcial, MAYOR sin precio_mayor, flag off, bodeguero sin acceso, atajos que no disparan con foco en input, smoke buscar→agregar→+1→MAYOR→total.
- Flag `pos-v1` queda en `false` en config/feature-flags.json; la página no se toca en el inicio (pos4).
- Tests: 14 nuevos (`__tests__/pos2-pos-page.test.tsx` 8 + `__tests__/pos2-flag-y-permisos.test.ts` 6). Suite 232/232, 1934/1934; tsc 0; lint 0/0; build OK (`/pos` 5.54 kB / 166 kB).
- Archivos: app/(app)/pos/page.tsx, app/(app)/pos/client_page.tsx, app/api/productos/route.ts, lib/rutas-por-rol.ts, components/TopNav.tsx, components/BottomNav.tsx, __tests__/pos2-*.test.*, AUTO-LOG.md.
## 2026-10-29 - pos2 fix: 4 bugs de la QA visual del DT en /pos
- (1) Lector de barras: `-` ya no se consume como atajo. Todo carácter imprimible se escribe en la búsqueda cuando hay texto (o foco en el buscador); `+`/`-` (y `code` NumpadAdd/NumpadSubtract) son cantidad solo con la búsqueda vacía. Otros inputs (monto del cobro) siguen sin atajos.
- (2) Enter resuelve contra el texto ACTUAL: nuevo `resultadosDe` marca a qué búsqueda corresponden los resultados; si están viejos/en vuelo, se piden de nuevo antes de decidir. Orden exacto → resaltado de esos resultados → nada + toast "Sin resultados para X". Nunca agrega el primer ítem de la grilla sin filtro.
- (3) Agregar un producto que ya está en la nota con modalidad detalle hace PATCH +1 a esa línea, sin duplicar.
- (4) `+` ahora funciona con la búsqueda vacía aunque el foco siga en el buscador (tras el Enter del lector); se aceptan `key` (`+`,`-`,`Add`,`Subtract`) y `code` (`NumpadAdd`/`NumpadSubtract`); la línea por defecto sigue siendo la última agregada/modificada.
- Tests nuevos (5) con keydown reales cubriendo los 4 bugs; los 3 restantes de pos2 siguen verdes. Suite 232/232, 1939/1939; tsc 0; lint 0/0; build OK (`/pos` 5.82 kB / 167 kB).
## 2026-10-29 - pos3: panel COBRAR + cliente en /pos (POS v1, 3 de 4)
- Ejecutado como pos3a (cliente) + pos3b (cobro) en una corrida, cada uno verificado con sus tests y el conjunto completo.
- Revisión de impacto lateral: `app/(app)/pos/client_page.tsx` (cableado + reemplazo del puente `PagarNotaDialog`), `app/api/clientes/route.ts` (la API no exposía ni filtraba `rut`; se agregó `rut` a la proyección y un filtro exacto `?rut=` para resolver el mesón sin depender del nombre), `app/(app)/notas-venta/[id]/client_page.tsx` (disparo mínimo por `?accion=pdf|whatsapp`), `scripts/migrations-order.ts`, y 3 tests que asumían que 047 era la última migración.
- Migración `048_cliente_meson.sql`: `ADD COLUMN IF NOT EXISTS rut` + índice único parcial + `INSERT ... SELECT ... WHERE NOT EXISTS` con RUT `66.666.666-6` y nombre `Cliente de mesón`. Aplicada SOLO en `.env.test` (aborta si la URL contiene `proud-hall`) y verificada contra la base real (fila `c20ed61d-…`); producción la aplica el DT.
- Cliente: sin cliente elegido → la nota se crea con el id del mesón (buscado por RUT, cacheado en memoria); si no existe, la nota se crea igual sin cliente y se muestra aviso discreto. Botón grande "Cambiar cliente" y F4; diálogo con búsqueda sobre la API existente, 5 recientes en localStorage (try/catch), flechas/Enter/Esc. Si la nota ya existe se actualiza con `PATCH /api/notas-venta/[id]` (ruta verificada, existía).
- COBRAR: F9/Ctrl+Enter/botón; monto enfocado y seleccionado con el saldo precargado; teclado físico + keypad opcional (0-9, 000, borrar) y atajos Exacto/5.000/10.000/20.000; 4 formas con teclas 1-4 solo fuera del campo monto; vuelto en vivo solo efectivo (se envía `min(monto, saldo)`), no-efectivo con monto > saldo bloqueado; selector de cuentas activas siempre visible con predeterminada por usuario (`pos-cuenta-default-<id>`), checkbox "Usar como predeterminada"; parcial permitido con "Queda debiendo"; doble submit bloqueado por ref; éxito con Imprimir PDF / WhatsApp / Nueva venta (Enter). Saldo para un segundo cobro se toma de `GET /api/notas-venta/[id]` y se ajusta con lo cobrado.
- Imprimir/WhatsApp sin duplicar el generador PDF de 1139 líneas de `notas-venta/[id]`: se navega a la nota con `?accion=pdf|whatsapp` y un efecto mínimo dispara las funciones existentes (`exportarPDF`/`compartirWhatsApp`). Menor riesgo que extraer el bloque PDF de una zona frágil; el fallback de WhatsApp ya existente se conserva.
- Flag `pos-v1` sigue en `false` (los tests mockean). Sin commits.
- Tests: nuevos `__tests__/pos3-cobrar.test.tsx` (10), `pos3-cliente.test.tsx` (5), `pos3-cliente-meson-migracion.test.ts` (2) y 4 de integración en `pos2-pos-page.test.tsx`. Suite 235/235, 1960/1960; tsc 0; lint 0/0; build OK (`/pos` 8.31 kB / 169 kB).
- Archivos: migrations/048_cliente_meson.sql, scripts/migrations-order.ts, app/api/clientes/route.ts, components/PosClienteDialog.tsx, components/PosCobrarDialog.tsx, app/(app)/pos/client_page.tsx, app/(app)/notas-venta/[id]/client_page.tsx, __tests__/pos3-*, __tests__/pos2-pos-page.test.tsx, __tests__/slice-00-schema.test.ts, __tests__/slice3a-modalidad-detalle-mayor.test.ts, __tests__/mercadopago-044-schema.test.ts, AUTO-LOG.md.
## 2026-10-30 - pos3 fix: grilla y nota vacías en /pos (QA visual con build local)
- Causa raíz (reproducida con Chrome real vía CDP): el servidor que sirvió la página no podía entregar sus chunks de cliente. `next dev` y `next build` comparten `.next`; al correr `npm run build` con el dev levantado, los chunks de dev (`/_next/static/chunks/app/(app)/pos/page.js?v=…`) pasan a 404. Sin chunks React no hidrata y queda el HTML del servidor: `Sin productos para ""` y `Agrega productos para armar la venta`, con APIs 200 y solo 404 de recursos en consola. Recargar no lo arregla porque el servidor sigue sirviendo HTML que apunta a archivos borrados.
- Evidencia: en el mismo servidor de dev, antes del reinicio la página pintaba 0 productos/0 líneas y los chunks devolvían 404; tras reiniciar `next dev` con la misma data (6 productos, nota 283 con 4 ítems) pintó 6/4. En `next start` (mismo build, misma sesión y datos) nunca se reprodujo.
- Fix mínimo: `distDir` por modo en `next.config.mjs` (`development` → `.next-dev`, resto → `.next`), `.next-dev/` al `.gitignore` y `.next-dev/types` al `tsconfig.json` (lo agrega Next). Un build ya no borra los chunks del dev.
- Tests: `__tests__/pos3-qa-distdir.test.ts` (2, rojos antes del cambio) + `__tests__/pos3-qa-repro.test.tsx` (escenario real: productos con search vacío, nota 283 restaurada y /api/clientes?rut=). Suite 237/237, 1963/1963; tsc 0; lint 0/0; build OK.
- Verificación del fix: `next dev` + `npm run build` en paralelo → la página de dev sigue con 6 productos / 4 líneas y sin 404 (antes del fix quedaba vacía). Flag `pos-v1` vuelve a `false`. Sin commits.
- Archivos: next.config.mjs, .gitignore, tsconfig.json, __tests__/pos3-qa-distdir.test.ts, __tests__/pos3-qa-repro.test.tsx, AUTO-LOG.md.
- DT: cambio distDir REVERTIDO (no era la causa). Causa real verificada: el panel del navegador de QA estaba oculto y el navegador frena los timers (debounce de 200 ms); la grilla carga sola al rato. Se borro pos3-qa-distdir.test.ts. QA de cobro OK: efectivo con vuelto (registra solo el saldo), tarjeta parcial, cliente de meson asignado. Migracion 048 aplicada en produccion.
## 2026-10-29 - pos4: inicio por rol + ajustes QA de UI (POS v1, 4 de 4)
- Revisión de impacto lateral (archivos existentes que había que tocar): `app/(auth)/login/page.tsx` (push fijo a /precios), `app/page.tsx` (redirect fijo), `app/manifest.ts` (start_url fijo), `middleware.ts` (fallback a `rutasPermitidas[0]` = /precios), `components/PosCobrarDialog.tsx` (alto del diálogo, footer, grilla de éxito, botones de 44px) y `app/(app)/pos/client_page.tsx` (spacer móvil insuficiente, botón "Nueva venta" de 32px en la nota). Sin cambios de DB, env ni flags.
- Nuevo `lib/ruta-inicio.ts` (puro, sin imports de servidor): `rutaInicio(rol, flags)` → flag off: todos `/precios` (comportamiento de hoy); flag on: admin/vendedor `/pos`, bodeguero `/bodega`, rol desconocido `/precios`. `rutaCallbackSegura(cb)` solo acepta rutas internas: rechaza `https://…`, `//evil.com`, `/\evil.com`, `javascript:`, vacío (anti open redirect).
- Login: tras `signIn` lee `callbackUrl` de la URL; si es seguro navega ahí; si no, `getSession()` → `rutaInicio`. `/` redirige con `rutaInicio`; middleware usa `rutaInicio` como fallback de acceso (con flag off el resultado es idéntico a `rutasPermitidas[0]`); `manifest.start_url` = `/pos` con flag, `/precios` sin flag (bodeguero cae a `/bodega` por middleware).
- QA 1366x800: `PosCobrarDialog` con `max-h-[calc(100dvh-2rem)]` + scroll interno y footer sticky (CONFIRMAR siempre visible); "Cobro registrado" sin desborde: PDF/WhatsApp en 2 columnas con `whitespace-nowrap` y "Nueva venta" a ancho completo (`col-span-2`) abajo; atajos Exacto/5.000/10.000/20.000 de h-11 (44px) a h-12 (48px).
- Móvil 375x812: la columna de la grilla pasa de spacer fijo `h-24` a `pb-40 lg:pb-0` (la barra fija "N items · $total · COBRAR" no tapa el último producto); Sheet de la nota con botones de 48px ("Nueva venta" de `size="sm"` a `h-12`).
- Flag `pos-v1` sigue en `false` (lo enciende el DT tras QA). Sin commits.
- Tests: 15 nuevos (`__tests__/pos4-inicio-por-rol.test.ts` 11 + `__tests__/pos4-ui.test.tsx` 4). Suite 238/238, 1976/1976; tsc 0; lint 0/0; build OK (compilado 10.2s, 48 páginas estáticas, `/pos` 8.38 kB / 169 kB, middleware 64.3 kB, exit 0, sin warnings).
- Archivos: lib/ruta-inicio.ts, app/(auth)/login/page.tsx, app/page.tsx, app/manifest.ts, middleware.ts, components/PosCobrarDialog.tsx, app/(app)/pos/client_page.tsx, __tests__/pos4-*, AUTO-LOG.md.
## 2026-10-30 - lim2: limpieza ponytail audit 2026-10-30 + tokens Tailwind rotos
- Decision DT aplicada en `docs/audits/ponytail-audit-2026-10-30.md` ("## Resultado (Director Tecnico)"): se aplican 3, 4, 6, 7; NO 1, 2, 5 (backlog A16–A18 en `docs/BACKLOG.md`).
- #3: `app/(app)/pos/client_page.tsx` usa `Producto` de `types/index.ts`; se borra el tipo local de 8 campos.
- #4: `puedeVenderMayor(p)` en `lib/precio-mayor.ts` (precio_mayor no nulo y entero > 0; reusa `esPrecioMayorValido`). Usada en el POS y en `AgregarANotaVentaModal`: con `precio_mayor = 0` el modal ya NO habilita "Por mayor". Regresión cubierta en `__tests__/lib/precio-mayor.test.ts` (caso 0).
- #6: `FormaPago` en `types/index.ts`, usado por `PosCobrarDialog`, `PagarNotaDialog` y `caja-mayor/client_page.tsx`.
- #7: eliminado `precio()` de un solo uso en `PosCobrarDialog` (inline `Number(monto || 0)`).
- Extra DT — clases Tailwind rotas (`]NNN`, `/10/20`) corregidas a tokens válidos:
  - `app/(app)/admin/caja-config/client_page.tsx:512`
  - `app/(app)/alertas-stock/client_page.tsx:30,144`
  - `app/(app)/bodega/registro-notas/client_page.tsx:177,201,264`
  - `app/(app)/caja-mayor/client_page.tsx:800,848,861,896,975,991,996,1099,1120,1226,1238,1272,1338,1347,1353`
  - `app/(app)/catalogo/admin/client_page.tsx:270,327,390,400,419,425`
  - `app/(app)/clientes/client_page.tsx:180,189`
  - `app/(app)/precios/client_page.tsx:279`
  - `app/(app)/ventas/kardex/page.tsx:15`
  - `components/CrearCatalogoDialog.tsx:119,144`
  - `components/ImageWithFallback.tsx:51`
- Sin commits. Verificación: tsc, lint, jest completo y build (ver corrida del DT).
## 2026-10-31 - portada-auto: portada automatica de la tienda (flag tienda-portada-auto = false)
- Contrato en `docs/slices/slice-portada-auto-fase-a.md` (incluye revision de impacto lateral). Disenado para produccion real: 69 productos, `categoria` NULL en los 69, 0 `imagen_url`, 0 `minimo_mayor`, 2 con stock -> 0 secciones de categoria y banner con el texto fijo; el desempate `id DESC` es el orden efectivo.
- Logica pura nueva en `components/tienda/portada-auto.ts`: `ordenRecientes` (fecha_ingreso DESC, sin fecha al final, desempate id DESC), `compararNovedades` (Destacados primero), `armarPortada` -> novedades (12), secciones por categoria (10 mas recientes, orden por cantidad desc/nombre), porMayor (`puedeVenderMayor` + `minimo_mayor` entero > 0), destacados (3, con foto primero) y `tituloBanner` (max 3 categorias + " y mas · Por mayor y por menor"; sin categorias, texto fijo con tilde).
- `ProductoTienda.fecha_ingreso` (ISO, sin migracion: columna existente desde 003). `TiendaPortada` renderiza secciones/carruseles y "Ver todos" (setCategoria + scroll) solo con flag ON; con OFF el JSX actual queda intacto salvo el badge.
- `es_nuevo` = Destacar: POST /api/productos inserta false por defecto y respeta boolean del body; `ProductDrawer` gana check "Destacar en la tienda" (admin, PUT existente, no hay PATCH) y el badge pasa a "Destacado"; `TarjetaProductoTienda` acepta `mostrarNuevo` y con flag ON ignora `es_nuevo` (en /catalogo/[slug] deja de mostrarse NUEVO, no requirio cambios en esa ruta).
- Tests nuevos: `__tests__/portada-auto-lib.test.ts` (10), `__tests__/portada-auto-render.test.tsx` (10, flag ON), `__tests__/portada-auto-flag-off.test.tsx` (1, flag OFF = render actual), `__tests__/api/productos-es-nuevo-default.test.ts` (3). Fixture de `slice8a-tienda-portada.test.tsx` actualizado con `fecha_ingreso: null`.
- Verificacion: tsc 0; lint 0 warnings/0 errores; jest 243/243 suites, 2006/2006 tests; build OK, exit 0. Sin commits, sin tocar datos de produccion ni next.config.
- Archivos: components/tienda/portada-auto.ts, components/TiendaPortada.tsx, components/TarjetaProductoTienda.tsx, components/ProductDrawer.tsx, lib/tienda-productos.ts, app/api/productos/route.ts, config/feature-flags.json, docs/slices/slice-portada-auto-fase-a.md, __tests__/portada-auto-*, __tests__/api/productos-es-nuevo-default.test.ts, __tests__/slice8a-tienda-portada.test.tsx, AUTO-LOG.md.

## 2026-10-31 - fotos-1: fotos de productos con Cloudinary (flag fotos-v1 = false)
- Contrato en PRD.md seccion "Fotos de productos (slice fotos-1, flag `fotos-v1`)" + revision de impacto lateral. Con flag OFF todo se comporta como hoy (tests mockean ON y OFF).
- Cliente: `lib/imagen-reducir.ts` (canvas, lado mayor <=1600 px, JPEG 0.85, entrada <=20 MB, base64 <3 MB; "La foto es muy pesada"). `ProductDrawer` reduce antes de subir, acepta `image/*` (camara/galeria sin capture) y un ref bloquea doble clic en SUBIR (no 2 uploads).
- Entrega: `lib/cloudinary-url.ts` (`urlCloudinary(url, ancho)` inserta `f_auto,q_auto,c_limit,w_N` sin duplicar; `sanearCodigo`). `ImageWithFallback` acepta `ancho` (default 600; tarjetas 400; drawer/detalle 1200), mantiene `unoptimized`; con flag ON y sin src muestra placeholder sin pedir la url adivinada.
- Servidor: `POST /api/productos/upload` responde 413 si `imageBase64` >4 MB (antes de Cloudinary), 503 "Fotos no configuradas" sin `CLOUDINARY_*`, usa `public_id = productos/<codigo saneado>` y `UPDATE ... WHERE codigo AND empresa_id = empresas[0]` de la sesion. `lib/cloudinary.ts` sube con `overwrite` + `invalidate`.
- Tests nuevos: `__tests__/lib/imagen-reducir.test.ts` (5), `__tests__/lib/cloudinary-url.test.ts` (6), `__tests__/api/productos-upload-fotos.test.ts` (3), `__tests__/image-with-fallback-fotos-on.test.tsx` (2), `__tests__/image-with-fallback-fotos-off.test.tsx` (1), `__tests__/fotos-upload-drawer.test.tsx` (2). `route.test.ts` existente fija credenciales ficticias por el nuevo 503.
- Verificacion: tsc 0 errores; lint 0 warnings/0 errores; jest 249/249 suites, 2025/2025 tests; build OK (compiled 9.5s, 48 paginas estaticas, exit 0). Sin commits, sin tocar next.config ni datos de produccion; finales de linea preservados.
- Archivos: lib/imagen-reducir.ts, lib/cloudinary-url.ts, components/ImageWithFallback.tsx, components/ProductDrawer.tsx, components/TarjetaProductoTienda.tsx, components/TiendaPortada.tsx, components/ProductCard.tsx, components/BodegaCard.tsx, app/(app)/pos/client_page.tsx, app/(app)/bodega/client_page.tsx, app/(app)/alertas-stock/client_page.tsx, app/api/productos/upload/route.ts, app/api/productos/upload/route.test.ts, lib/cloudinary.ts, config/feature-flags.json, PRD.md, AUTO-LOG.md.
- Ajuste DT (mismo slice): el canvas se pinta blanco (`fillStyle = #ffffff` + `fillRect`) antes de `drawImage` para que PNG/WEBP con transparencia no queden con fondo negro al exportar JPEG; test nuevo en `imagen-reducir` (6 tests). Verificacion final: jest 249/249, 2026/2026; tsc 0; lint 0/0.

## 2026-10-31 - pos-stock: el POS oculta productos sin stock (flag pos-solo-stock = false)
- Contrato en PRD.md seccion "POS v1", subseccion "pos-stock" + revision de impacto lateral. Con flag OFF el POS queda exactamente como hoy (URL sin soloStock, sin check); tests mockean ON y OFF.
- `app/(app)/pos/client_page.tsx`: con flag ON la grilla inicial y la busqueda por texto agregan `&soloStock=true`; check "Ver sin stock" (label nativo, min-h-11 = 44 px, sin persistencia, apagado al abrir) quita el filtro. El refetch usa AbortController + guard para que la respuesta vieja no pise la lista al togglear.
- Lector/Enter con codigo exacto: se consulta SIEMPRE sin filtro de stock; si el exacto tiene saldo <= 0 y el check esta apagado -> toast "Sin stock: <codigo>" y no agrega; con check encendido agrega como hoy. Sin codigo exacto se usa la lista visible filtrada.
- API `GET /api/productos` ya soportaba `soloStock` (HAVING SUM(saldo)>0): sin cambios. Sin migracion, sin env nuevas, sin otros consumidores.
- Tests nuevos: `__tests__/pos-stock.test.tsx` (7, flag ON: grilla, texto, check, race de respuesta tardia, lector sin/con stock, regresion con stock) y `__tests__/pos-stock-flag-off.test.tsx` (1, flag OFF = sin soloStock ni check). Fase B roja verificada antes de implementar (6/8 rojos; el OFF y la regresion ya pasaban).
- Verificacion: tsc 0; lint 0 warnings/0 errores; POS existentes 38/38 verdes; jest completo 2013/2034 (9 suites / 21 tests rojos IDENTICOS a la linea base medida en HEAD con stash: 2005/2026, 9/21; el delta es +2 suites y +8 tests verdes); build OK, exit 0. Sin commits, sin tocar datos de produccion ni next.config; finales de linea preservados.
- Archivos: app/(app)/pos/client_page.tsx, config/feature-flags.json, PRD.md, __tests__/pos-stock.test.tsx, __tests__/pos-stock-flag-off.test.tsx, AUTO-LOG.md.

## 2026-10-31 - tests: 21 rojos por fotos-v1 ON corregidos (solo tests)
- Causa: con `fotos-v1 = true`, `ImageWithFallback` sin src pinta el codigo en el placeholder; 9 suites buscaban el codigo con `getByText` y encontraban 2 nodos.
- Arreglo solo en tests (sin mockear el flag, codigo de app intacto): consultas acotadas a `findAllByText`/`getAllByText` (placeholder y celda/encabezado conviven en la misma fila/tarjeta, ambos abren el drawer o prueban presencia).
- Verificacion flags tal cual: jest 251/251 suites, 2034/2034 tests. Con `pos-solo-stock: true` temporal: 248/251 suites, 2031/2034 tests; los 3 rojos son POS (`pos2-pos-page`, `pos3-qa-repro`, `pos4-ui`) del slice pos-stock en curso, ajenos a este arreglo. Flag restaurado a false byte-exacto. tsc 0; lint 0/0. Sin commit; finales de linea preservados.
- Archivos: __tests__/bodega-client_page.test.tsx, __tests__/slice7-excel-paleta.test.tsx, __tests__/notas-venta-guardar-item.test.tsx, __tests__/notas-venta-eliminar-item.test.tsx, __tests__/productos-cambiar-codigo-ui.test.tsx, __tests__/notas-venta-auto-focus.test.tsx, __tests__/notas-venta-stock-frontend.test.tsx, __tests__/prenota-detalle.test.tsx, app/(app)/bodega/client_page.test.tsx, AUTO-LOG.md.

## 2026-10-31 - Ajuste DT pos-stock: tests POS con flag ON y OFF
- pos2/pos3-qa/pos4 fijan comportamiento previo: mockean `@/config/feature-flags.json` con los flags reales y `pos-solo-stock: false`; el ON queda cubierto por pos-stock.test.tsx. Codigo de la app sin cambios (sin bug real encontrado).
- Verificacion: jest completo --silent con flag false = 251/251 suites, 2034/2034 tests; con flag true temporal = 251/251, 2034/2034; json restaurado byte-exacto (diff solo la linea del flag). tsc 0; lint 0/0.
