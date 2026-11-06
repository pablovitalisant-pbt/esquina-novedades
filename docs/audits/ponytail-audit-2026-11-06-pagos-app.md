# Ponytail audit — Pagos privados

Revisión de la página, las dos navegaciones, el acceso, la carga de imagen, el CLI y las migraciones 051 y 052. Claude-Deep revisó en modo lectura y el DT contrastó cada hallazgo con el árbol.

- La página privada declaraba un segundo landmark `main` dentro de `AppShell`. El corte de cierre corrige la estructura y añade una prueba de regresión.
- El guard del registro usaba un cast anterior a la declaración del flag. El corte de cierre usa la clave tipada del JSON.
- Se conservan los controles de MIME en cliente, servidor y DB. Cada capa tiene una responsabilidad propia. El UUID de URL lo genera PostgreSQL; las claves idempotentes del CLI no se usan como ID de URL.
- Se verificó que la navegación recibe solo el booleano de acceso y que tanto la página como la descarga vuelven a comprobar los permisos en servidor.
- El smoke de N12 comprobó acceso con dos IDs autorizados y rechazo de un tercer administrador. El entorno TEST confirmó el comprobante y el asiento intacto. La limpieza verificó que los triggers quedaron activos.
