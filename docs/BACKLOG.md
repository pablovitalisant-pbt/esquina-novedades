# BACKLOG — La Esquina de las Novedades

Actualizado: 2026-10-23 (tarde, modo autónomo; detalle por slice en `AUTO-LOG.md`). Orden = orden de ejecución sugerido. Lo que depende de Paola va al final.
Fuentes: `PRD.md` (§9 slice 11, §10), `CONTEXT-CLAUDE-CHAT.md`, `docs/TRASPASO-2026-10-23.md`, `BUGS.md`.
Cada ítem de código se ejecuta como ciclo PBT-IA (o protocolo de debugging si es bug). Estado: ⬜ pendiente · 🟨 en curso · ✅ hecho.

## Estado general
MVP funcional completo (slices 0–10) y en producción con credenciales de PRUEBA. Flujo de pago verificado de punta a punta el 2026-10-23.
Falta el **slice 11 — Deploy producción**, que se descompone abajo.

---

## Bloque A — Calidad y Señal 3 (no depende de nadie)

| # | Ítem | Por qué | Criterio de hecho | Estado |
|---|------|---------|-------------------|--------|
| A1 | Actualizar documentación desfasada | PRD §8.4 dice que un pago rechazado devuelve stock (la decisión vigente es NO liberarlo; solo expiración 36 h). PRD §9 no marca el slice 0 como ✅. Contador de ponytail en CONTEXT no se actualizó desde el 22/10 | PRD y CONTEXT reflejan lo implementado; contador al día | ✅ |
| A2 | Ponytail audit | Señal 2 cerca (≥3 ciclos desde el audit del 22/10) y es requisito 1 de la Señal 3 | Audit en `docs/audits/` + slice de limpieza si hace falta | ✅ |
| A3 | Validar variables de entorno requeridas al arrancar | PRD §10.3. Hoy solo hay chequeos al usar cada variable (p. ej. config de MP) | La app falla al iniciar con mensaje claro si falta una requerida; test | ✅ |
| A4 | `tsc --noEmit` limpio | 108 errores (línea base; casi todos en tests, 1 en `.next/types`) | 0 errores. Probablemente en sub-slices por carpeta | ✅ |
| A5 | Build estricto | `next.config` ignora errores de tipos y lint (`ignoreBuildErrors` / `ignoreDuringBuilds`). Señal 3 pide build sin errores ni warnings | Flags removidos; `npm run build` y `npm run lint` sin errores ni warnings. Depende de A4 | ✅ |
| A6 | Fixtures para la rama Neon `test-integration` | 5 suites heredadas en rojo (18 tests): `catalogo-precio-override`, `debug/42p18-handler`, `productos-crear-smoke`, `productos-stock-minimo-ui`, `app/api/notas-venta/[id]/items/route.test.ts` | Suite completa 100 % verde | ✅ |
| A7 | Catálogo público redondea a 1 decimal (herencia USD) | Listado en CONTEXT como pendiente; **no verificado si sigue ocurriendo** | Verificar; si ocurre, CLP entero en todo el catálogo | ✅ |
| A8 | Completar "Zonas de riesgo conocidas" del PRD | Hoy solo tiene `scripts/migrations-order.ts`. Faltan: webhook MP (clave = app dueña de las credenciales; simulador no prueba pagos reales), IPN legacy, reserva de stock (BUG-003), flags leídos por tests (BUG-004) | Tabla completa | ✅ |
| A9 | Smoke E2E de todos los flujos | Requisito 2 de la Señal 3 | Checklist ejecutado con evidencia: login, notas de venta (unidad/caja/mixta), precios, clientes, caja mayor, bodega, alertas, catálogo admin/público, tienda + pago MP, pedidos staff, deudores | ✅ 2026-10-23: público + 15 módulos de staff en solo lectura, sin errores. Hallazgo → A12 |
| A10 | Diff de variables de entorno prod vs dev | Requisito 4 de la Señal 3 | Lista de keys (sin valores) por entorno, sin faltantes | ✅ |

| A11 | Tipar los `any` heredados de Bazar Naty | 385 `any` en 99 archivos; `no-explicit-any` quedó desactivado en A5 para tener build estricto | Regla reactivada y lint 0/0. Deuda, no bloquea go-live | ✅ 2026-10-23 (386 → 0, regla reactivada) |

| A12 | **Decisión de producto pendiente:** costo de entrega en la nota de venta | Pedido `afb8e9f4…` (Delivery Iquique): pedido y cobro en caja = $56.990, pero la nota de venta #1 = $53.990 (no incluye los $3.000 de entrega). El PRD (§8.4/§8.5) no define dónde va ese costo | Pablo decide: (a) agregar línea "Despacho" a la nota al convertir, o (b) dejarlo fuera y registrarlo aparte. Luego ciclo PBT-IA | ✅ 2026-10-23 opción (a): línea Despacho |

## Bloque B — Infraestructura (no depende de Paola, sí de accesos)

| # | Ítem | Por qué | Criterio de hecho | Estado |
|---|------|---------|-------------------|--------|
| B1 | Dominio `laesquinadelasnovedades.store` → Vercel | Slice 11. Necesita acceso a Namecheap (cuenta de la clienta) | Dominio con SSL sirviendo la app | ✅ 2026-10-26: A @ 216.198.79.1, CNAME www → Vercel; www redirige 308 al dominio principal |
| B2 | Actualizar URLs tras el dominio | `NEXTAUTH_URL`, `NEXT_PUBLIC_SITE_URL` (back_urls y `notification_url` de MP salen de ahí) y URL del webhook en MP | Variables + redeploy; pago de prueba redirige al dominio nuevo. Depende de B1 | ✅ 2026-10-26: NEXTAUTH_URL y NEXT_PUBLIC_SITE_URL = https://laesquinadelasnovedades.store |

## Bloque C — Depende de Paola (al final)

| # | Ítem | Qué falta de Paola | Criterio de hecho | Estado |
|---|------|--------------------|-------------------|--------|
| C1 | Rebranding final | Logo (PNG), colores, URLs de Facebook/Instagram/TikTok | Logo real en UI y PDF de notas (hoy wordmark de texto); tokens de color; redes enlazadas | 🟨 preparado: reemplazar `public/marca/*` y valores en `lib/empresa.ts` |
| C2 | Carga de productos reales | Excel (código, nombre, categoría, precio detalle, precio mayorista por caja, unidades por caja, stock, stock mínimo) + fotos | Productos importados; `CLOUDINARY_*` en Vercel; fotos visibles | ⬜ |
| C3 | Usuarios | Nombres y emails de los 4 usuarios (2 Administración, 2 Ventas) | Usuarios creados; Paola entra con el suyo | ⬜ |
| C4 | Mercado Pago producción | Su propia app de MP (trabada en la verificación de su celular) y luego "Solicitar acceso a las credenciales" para Pablo | `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` de **la misma app, Modo productivo**; URL del webhook en Modo productivo; redeploy; **pago real de bajo monto** procesado (único criterio válido, ver BUG-005). Revisar ahí el texto de MP "te llevaremos a ." | ✅ 2026-10-26: app "La Esquina de las Novedades - Tienda" (8021659669573211) en la cuenta de La Esquina; webhook Modo productivo; pago real $2.490 (op. 185184493641) convertido con nota y cobro |
| C5 | Boleta electrónica | Confirmar si la boleta de MP cubre las ventas online | Respuesta documentada (fuera del MVP) | ⬜ |
| C6 | Go-live | Todo lo anterior | Borrar datos de prueba en prod (3 pedidos de prueba, sus notas de venta y cobros en caja, productos `DEMO-*`), revisión final de la Señal 3 | ✅ 2026-10-26: ejecutado en producción (4 pedidos, 5 notas, 4 cobros, 2 clientes, 5 productos DEMO); respaldo previo en ~/.pbt-runner/respaldo-golive-2026-10-26.json. Se conservan usuarios, cuentas de caja, opciones de entrega y el catálogo NAVIDAD |

## Fuera de este proyecto (anotado para no perderlo)
- Bazar Naty sigue en Next 14.2.35 con 2 vulnerabilidades críticas.