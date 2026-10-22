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

Slice 0 del PRD §9: Neon + verificación del schema desde DB vacía + seed.

## Contador de slices desde el último ponytail audit

0
