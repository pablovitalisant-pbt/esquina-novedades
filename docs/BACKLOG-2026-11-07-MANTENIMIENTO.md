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
| M01 | 8 + parte de 9 | Crear nota rechaza HTTP fallido e ID inválido antes de agregar ítems; eliminar verificarOk y conservar payloads | Pendiente |
| M02 | resto de 9 | Cuentas de caja rechazan HTTP fallido antes de consumir data; eliminar soloSiOk y conservar manejo de error de ambos diálogos | Pendiente |
| M03 | 10 | ErrorApi compartido con subclases ErrorNota/ErrorPago compatibles; conservar instanceof, name y mensajes | Pendiente |
| M04 | 11 | Retirar comentarios de reactivación de Kardex; conservar ruta y ausencia de enlaces | Pendiente |
| M05 | 12 | Fijar estados de flags en las dos suites de precios y comprobar ramas ON/OFF relevantes | Pendiente |
| M06 | 13 | Reconciliar BACKLOG histórico, PRD, CLAUDE y traspasos con decisiones y evidencia actuales, sin reescribir el historial | Pendiente |

Cada corte ≤200 líneas añadidas + eliminadas; fix de bug ≤50 líneas de implementación. Contrato y revisión lateral antes de tests rojos; implementación solo tras rojo verificado por el DT. Smokes E2E en TEST, sin pedidos ni cobros ficticios en producción. No se incorporan funcionalidades nuevas ni flags que oculten correcciones.

## Confirmación de usuarios

Revisados `app/api/admin/usuarios/route.ts` y `app/(app)/admin/usuarios`: POST autoriza administradores, valida datos, inserta usuario y asociación a empresa 1. No cuenta usuarios ni establece cupo de cuatro. El RUT debe ser único. El número en PRD se actualizará como escala inicial, no restricción.
