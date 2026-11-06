# N14 — Viabilidad de conciliación automática de transferencias

Consultado el 6 de noviembre de 2026. BancoEstado publica cartolas y exportación periódica de conciliación para Cuenta Corriente Empresas. Banco Falabella describe cartolas con cargos y abonos. Estas fuentes no confirman una API directa del banco para la cuenta de esta tienda.

- [BancoEstado, instructivo de Cuenta Corriente](https://www.bancoestado.cl/imagenes/empresas2008/Nueva_Home_Empresas/campanas2021/2021817_instructivos/pdf/806_instructivo_cta_cte.pdf)
- [Banco Falabella, cartola de Cuenta Corriente](https://www.bancofalabella.cl/glosario-educacion-financiera)

Khipu enumera BancoEstado para Personas y Empresas, y Banco Falabella para Personas en Chile. También documenta consulta de movimientos asentados de BancoEstado Empresas. Son opciones para una prueba, sujetas a tipo de cuenta, consentimiento, contrato, costo y datos que realmente entregue el proveedor.

- [Khipu, instituciones y tipos de cuenta](https://docs.khipu.com/data-solutions/open-finance/api-reference)
- [Khipu, movimientos de cartola BancoEstado Empresas](https://docs.khipu.com/en/apis/v1/cl/banking/business/bancoestado.cl/openapi/other/statementstransactions)

Para producción falta identificar banco y tipo de cuenta receptora, validar acceso autorizado de lectura y recibir un abono controlado que permita comprobar moneda, monto, referencia y un identificador estable. El conector debe procesar solo abonos asentados, deduplicar por cuenta e identificador bancario y dejar coincidencias ambiguas para revisión. Los datos de login bancario no van en la app ni en Git.

N03 y N04 permiten operar con verificación manual de la cartola. No se acredita conciliación automática ni una conexión real con estos documentos.
