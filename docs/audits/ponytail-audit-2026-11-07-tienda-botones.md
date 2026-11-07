# Auditoría previa a BUG-013

Claude-Deep revisó botón, tarjeta, consumidores y pruebas. DT contrastó código de Button, gate, CarritoContext y los cuatro carruseles/grilla de TiendaPortada. Cinco cortes desde la auditoría anterior (M04/M05, BUG-012, M07/M08); revisión preventiva antes de los dos cortes visuales.

- Causa estática y captura coinciden: dos columnas dentro de tarjetas de 150px y whitespace-nowrap del Button compartido. Corregir solo CTA de compra, sin cambiar Button global.
- CarritoContext completa el mínimo con Math.max; desde el mínimo suma una unidad. Mantener lógica e inputs de cálculo server-side intactos.
- Separar acciones requiere dos instancias con su propio gate; comprobar compra mayor sin contacto y cantidad conservada. No cambiar registro de cliente ni validación de checkout.
- Portada, categorías, mayor y catálogo comparten TarjetaProductoTienda. No requieren cambios de consumidores: la ubicación se corrige dentro de la tarjeta común.
- Stock menor al mínimo oculta precio/acción mayor; no introducir una restricción nueva para compra detalle. Flag off y precios ocultos conservan su comportamiento.
- No modificar API, reservas ni schema. Sin dependencias, flags o variables nuevas. Sin hallazgos bloqueantes adicionales; alcance en contrato BUG013-botones-compra-movil.md.
- DT revisó además el diff anterior `473ff13..d944b8c` de TopNav/AppShell/AgregarANotaVentaModal: permisos, pos-v1, rutaInicio con excepción Bodega, orden POS y tinta de BUG-012 conservados; saludo estable de BUG-009 intacto. M04/M05 fueron comentarios/cobertura. Se reinicia el contador antes de V01.
