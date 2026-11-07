# Backlog de mantenimiento — 2026-11-07

Autorizado por Pablo: resolver los puntos 8–13 del listado histórico, con Claude-Deep como programador y verificación independiente del DT. Continúan autorizados contratos, fases, commits, push y despliegue. Base limpia: `4bad9b2`.

## Decisiones de producto vigentes

- Datos de productos y precio MBC: los completa/revisa Paola manualmente; no son tareas de desarrollo.
- Usuarios: los cuatro previstos eran una estimación, no un límite de la aplicación. Administración permite crear más cuentas, con RUT único.
- Redes: en espera de enlaces de Paola.
- Boleta electrónica: sigue pendiente, fuera de este mantenimiento.
- Texto de Mercado Pago: Pablo informa que vio el nombre de la tienda; no hay un bug reproducido abierto.
- Pago real de prueba: devolución recibida, confirmado por Pablo.
- Conciliación bancaria automática: postergada por Pablo.

## Orden de ejecución

| Corte | Origen | Contrato | Estado |
|---|---|---|---|
| M01 | 8 + parte de 9 | Crear nota rechaza HTTP fallido e ID inválido antes de agregar ítems; eliminar verificarOk y conservar payloads | Verificado, 9694bf7 |
| M02 | resto de 9 | Cuentas de caja rechazan HTTP fallido antes de consumir data; eliminar soloSiOk y conservar manejo de error de ambos diálogos | Verificado, e418a88 |
| M03 | 10 | ErrorApi compartido con subclases ErrorNota/ErrorPago compatibles; conservar instanceof, name y mensajes | Cerrado, 473ff13 |
| M04 | 11 | Retirar comentarios de reactivación de Kardex; conservar ruta y ausencia de enlaces | Cerrado, a1a9337 |
| M05 | 12 | Fijar estados de flags en las dos suites de precios y comprobar ramas ON/OFF relevantes | Cerrado, 2189f34 |
| M06 | 13 | Reconciliar BACKLOG histórico, PRD, CLAUDE y traspasos con decisiones y evidencia actuales, sin reescribir el historial | Cerrado en 65b253d |

Cada corte ≤200 líneas añadidas + eliminadas; fix de bug ≤50 líneas de implementación. Contrato y revisión lateral antes de tests rojos; implementación solo tras rojo verificado por el DT. Smokes E2E en TEST, sin pedidos ni cobros ficticios en producción. No se incorporan funcionalidades nuevas ni flags que oculten correcciones.

## Confirmación de usuarios

Revisados `app/api/admin/usuarios/route.ts` y `app/(app)/admin/usuarios`: POST autoriza administradores, valida datos, inserta usuario y asociación a empresa 1. No cuenta usuarios ni establece cupo de cuatro. El RUT debe ser único. PRD actualizado: escala inicial, no restricción.

## Cierre verificado por el DT

- M01: 4 fallos específicos antes del fix; M02: 4 fallos antes del fix; M03: módulo base ausente antes de implementación. M04/M05 son limpieza/cobertura de comportamiento existente, sin rojo artificial.
- 11 suites dirigidas y 72 pruebas verdes: helpers, modal, POS/cobro, navegación/hidratación y precios ON/OFF. Comandos y riesgos en los contratos M01 y M02–M05.
- `npx tsc --noEmit` y `npm run lint` verdes. Build estricto con env TEST precargado: código0, 49 páginas estáticas generadas. No cambios de configuración de compilación ni dependencias.
- Arnés privado: `node node_modules/playwright/cli.js test --config mantenimiento.config.cjs`, 3 smokes verdes, incluyendo fallos/recuperación de creación y cuentas de caja y navegación desktop/mobile. Espera de hidratación corregida en el arnés antes del pase final. APIs de mutación interceptadas: sin ventas/cobros reales ni cambios en producción.
- Auditoría `audits/ponytail-audit-2026-11-07-mantenimiento.md`; contador posterior, 2 (M04/M05). Sin schema, migraciones, variables ni flags nuevos.
- Publicación: push del commit de cierre a main; confirmar el estado Vercel de ese SHA antes de informar producción actualizada. El estado de despliegue queda asociado al commit en GitHub.

Fuera de este mantenimiento: redes en espera, boleta pendiente, datos/precios a cargo de Paola y conciliación automática postergada. No se reabren como tareas técnicas los puntos 1–7 cerrados o delegados por Pablo.
