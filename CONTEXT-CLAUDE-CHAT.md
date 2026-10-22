# CONTEXT-CLAUDE-CHAT.md — La Esquina de las Novedades

Contexto de la Sesión 0 (2026-10-21/22) para continuidad entre el chat de
Dirección Técnica y Claude Code.

## Origen

Copia de `bazar-naty` (https://github.com/pablovitalisant-pbt/bazar-naty).
El script `crear-proyecto-esquina-novedades.ps1` lo clona con `--depth 1`,
borra su `.git`, mueve la documentación de Bazar Naty a
`docs/referencia-bazar-naty/` y arranca un git nuevo.

## Clienta

Paola Arias — LA ESQUINA DE LAS NOVEDADES SPA (RUT 78.211.131-0), Iquique.
Tienda que vende al por mayor (cajas completas) y al detalle (unidades).
Reunión de levantamiento: 2026-10-21 (datos en el proyecto de Claude:
`datos-cliente-reunion-2026-10-21.md`).

## Decisiones tomadas en la Sesión 0

- Stack igual a bazar-naty + Mercado Pago Checkout Pro (confirmado por Pablo).
- Moneda única CLP. Se elimina USD/ARS y tipo de cambio.
- PowerSync / offline se elimina (no dio resultado en Bazar Naty).
- Roles: 2 Administración + 2 Ventas. Sin rol Bodega (admin maneja inventario).
- Mayorista = caja completa al precio mayorista por caja. Detalle = unidad.
  Mismo inventario en unidades.
- Notas de venta: tipo derivado de los ítems (mayor / menor / mixta).
- Todos los clientes quedan registrados; etiqueta derivada del historial
  (mayorista / minorista / ambos). (Pablo corrigió la propuesta inicial "sin
  registro": el registro es obligatorio.)
- Tienda online vende ambas modalidades, carrito mixto permitido.
- Pago al momento de hacer el pedido. Pedido sin pagar expira a las 36 h.
- Reserva de stock al crear el pedido; liberación perezosa + cron diario
  (compatible con Vercel Hobby, cron 1 vez/día).
- Pago aprobado → nota de venta automática + cobro en caja "Mercado Pago".
- Comisión MP la absorbe la tienda.
- Entrega: retiro $0, Iquique $3.000, Alto Hospicio $4.000, Arica pagado al
  chofer ($0 en checkout). Costos configurables.
- Reembolsos fuera de MP (cambio, transferencia o efectivo).
- Boleta electrónica fuera del MVP (verificar cobertura MP para ventas online).
- Cajas: configurables en la app.

## Infraestructura (todo a nombre de la clienta)

- Dueño de Vercel, Neon y Cloudinary: contactogvingenieria@gmail.com
- Neon: org `org-lucky-math-65013365`, proyecto `steep-shape-55022986`, branch `production`
- Dominio: laesquinadelasnovedades.store (Namecheap)
- Mercado Pago: cuenta de la empresa (laesquinadelasnovedades2860@gmail.com)

## Pendientes de la clienta

Logo y colores, Excel de productos + fotos, usuarios (nombre/email),
credenciales de prueba MP + clave secreta webhook.

## Próximo paso

Slice 0 completado (pendiente commit). Ver docs/slices/slice-00-neon-schema-fase-d.md.

## Contador de slices desde el último ponytail audit

1

## Estado al 2026-10-22 (sesion autonoma Director Tecnico)

Slices completados y commiteados (cada corte verificado por el DT con suite completa + tsc; cierres con build + smoke E2E):
- 0 Neon + schema + seed | BUG-001 jest usaba produccion (ahora .env.test -> rama test-integration + safeguard)
- 3 PowerSync/offline/SW eliminados | 2 CLP unica moneda (guard)
- 4 precio_mayor (040) | 5 modalidad unidad/caja + subtotal generado (041) + tipo de nota | 6 etiqueta cliente
- 7 tienda: carrito por modalidad, checkout con email y entrega (042), precios server-side
- 8 reserva atomica de stock + expiracion 36 h perezosa + cron diario (043)
- 9 preferencia Checkout Pro + pagina publica /pedido/[id] (044) | 10 webhook firmado + nota y cobro automaticos
- 1 rebranding sin logo (wordmark de texto)
Migraciones 040-044 aplicadas en test-integration y production (scripts: C:\Users\pablo\.pbt-runner\apply-one.ps1).

Flags nuevos en false (activar con Pablo): precio-mayorista-ui, notas-venta-modalidad, clientes-etiqueta, tienda-pago-online.

Decisiones DT relevantes: rejected/cancelled de MP NO liberan stock (el comprador puede reintentar); solo expiracion 36 h o fallo al crear preferencia. Usuario sistema SISTEMA-MP (inactivo) para notas/cobros del webhook. Precio de catalogo solo para productos de la seleccion del catalogo.

Pendientes:
- Credenciales MP de prueba + MP_WEBHOOK_SECRET; definir en Vercel: MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET, NEXT_PUBLIC_SITE_URL, CRON_SECRET, DATABASE_URL (pooled), NEXTAUTH_*, CLOUDINARY_*.
- Validar init_point vs sandbox_init_point con credenciales reales (lib/mercadopago/config.ts).
- Logo y colores de la clienta; Excel de productos; usuarios.
- 5 suites heredadas en rojo: rama test-integration sin fixtures (cuentas, productos) + 2 tests de labels de precios. Slice de fixtures de test.
- Catalogo publico redondea a 1 decimal (herencia USD): limpiar a entero.
- Deploy (Senal 3): next.config tiene ignoreBuildErrors/ignoreDuringBuilds -> revisar antes de produccion.

## Contador de slices desde el ultimo ponytail audit

0 (ponytail audit 2026-10-22 hecho: docs/audits/ponytail-audit-2026-10-22.md; aplicado en slice L1 salvo registro de notas de bodega, que se conserva por decision de Pablo)

## Seguridad y version (2026-10-22, tarde)
- Next.js 14.2.35 -> 15.5.28 (React 18 se mantiene). next-auth 4.24.15. xlsx eliminado (exceljs). npm audit prod: 0 criticas, 1 alta (postcss interno de next, solo build), 3 moderadas.
- Limpieza L1 aplicada (despachos-ia, flags muertos, sharp, shadcn). Registro de notas de bodega se conserva.
- BUG-002: dotenv ahora devDependency explicita.

