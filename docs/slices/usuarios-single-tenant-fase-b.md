# Slice: Usuarios — single-tenant + RUT → Documento de identidad

## Fase B — Análisis de riesgos y tests

**Fecha:** 2026-07-05

---

## 1. Análisis de riesgos

### 1.1 PUT: DELETE + INSERT sin transacción — riesgo de usuario huérfano

**Archivo:** `app/api/admin/usuarios/[id]/route.ts`

**Estado actual:** el PUT solo ejecuta DELETE + INSERT si el body incluye
`empresas` (líneas 34-40 actuales). Si no viene `empresas`, la asociación
`usuario_empresa` queda intacta.

**Estado post-slice:** el contrato (Fase A) propone que el DELETE + INSERT sea
**incondicional** — cada PUT, sin importar qué campos se modifican, borra y
reinserta `(usuario_id, empresa_id) = (uid, 1)`.

**Riesgo:** si el `DELETE` tiene éxito y el `INSERT` falla (error de DB,
violación de constraint, corte de conexión), el usuario queda **sin ninguna
fila en `usuario_empresa`**.

**Impacto:** `session.user.empresas = []` → todos los checks de autorización
(`user.empresas.includes(empresaId)`) fallan → el usuario no puede acceder a
ningún recurso protegido. En la práctica, queda bloqueado hasta que un admin
vuelva a editar su registro.

**Probabilidad:** baja en runtime normal (Neon serverless es confiable, la
operación es una sola fila). Pero el riesgo existe en teoría — no hay
transacción SQL que envuelva el DELETE + INSERT.

**Mitigación posible (fuera de scope de este slice):** envolver DELETE + INSERT
en `sql.begin()` / `sql.commit()` si Neon lo soporta. Se documenta como deuda
técnica para slice futuro. No se implementa ahora porque:
- El mismo patrón sin transacción ya existe en el código actual (cuando
  `empresas` está presente en el body).
- El volumen es bajo (< 15 usuarios, operaciones de admin poco frecuentes).
- Agregar transacción es un cambio de infraestructura que excede las 3 líneas
  del diff propuesto.

**Test asociado:** `usuarios.test.ts` — Test 3 (simula fallo del INSERT
post-DELETE para verificar que el handler no revierte el DELETE).

### 1.2 POST: creación sin validación de empresas — sin riesgo nuevo

**Archivo:** `app/api/admin/usuarios/route.ts`

**Cambio:** se elimina la validación `if (!empresas || empresas.length === 0)`
y el `for` loop. Se reemplaza por un solo `INSERT INTO usuario_empresa` con
`empresa_id = 1`.

**Riesgo:** el mismo que ya existe hoy — si el INSERT en `usuarios` tiene éxito
pero el INSERT en `usuario_empresa` falla, el usuario existe en la tabla
`usuarios` pero sin asociación a empresa → no puede loguearse. Este riesgo es
**preexistente** e **idéntico en magnitud** al código actual (el `for` loop
actual también puede fallar en cualquiera de sus iteraciones).

**Conclusión:** sin riesgo incremental. El cambio reduce complejidad (loop por
single INSERT) sin cambiar la superficie de fallo.

### 1.3 Concurrencia: dos PUT simultáneos al mismo usuario

**Escenario:** dos admins editan el mismo usuario al mismo tiempo. Ambos PUTs
ejecutan `DELETE FROM usuario_empresa WHERE usuario_id = ${uid}` y luego
`INSERT INTO usuario_empresa (usuario_id, empresa_id) VALUES (${uid}, 1)`.

**Resultado:** el primer PUT borra e inserta; el segundo PUT borra (la fila del
primero) e inserta de nuevo. El resultado final es correcto: una fila con
`empresa_id = 1`. El único efecto colateral es que el primer PUT "pierde" su
escritura, pero como ambos escriben el mismo valor (`empresa_id = 1`), el
resultado es idempotente.

**Si hubiera un unique constraint en `(usuario_id, empresa_id)`:** el segundo
INSERT podría fallar si el timing es exacto (INSERT del segundo PUT ocurre
entre el DELETE y el INSERT del primer PUT — pero como ambos son queries
secuenciales dentro del mismo handler, esto requeriría un entrelazado de
nanosegundos). En la práctica, con el volumen esperado (< 15 usuarios,
operaciones de admin poco frecuentes), la probabilidad es efectivamente cero.

**Conclusión:** riesgo descartado por volumen y idempotencia. Sin test de
concurrencia.

### 1.4 Importación de `formatRut` — dead import post-slice

**Archivo:** `app/(app)/admin/usuarios/client_page.tsx`

Post-slice, `formatRut` ya no se importa ni se usa en `client_page.tsx`. Si el
import no se elimina, `tsc --noEmit` no reporta error (unused import no es error
en TS con la config actual), pero es dead code.

**Conclusión:** riesgo trivial de linting. El contrato ya prevé eliminar el
import y el uso de `formatRut`. El test de humo verifica que el import
desaparezca del archivo.

---

## 2. Tests (Fase B — deben estar en ROJO ahora, en VERDE en Fase C)

### 2.1 Estructura de tests

Los tests usan el mismo patrón de mocking que `__tests__/api/categorias.test.ts`:
`getServerSession` y `sql` se mockean a nivel de módulo. Los handlers se
importan dinámicamente en `beforeAll` para que los mocks de Jest estén activos.

### 2.2 Lista de tests

| # | Test | Qué intenta romper | Resultado esperado (contra contrato) |
|---|------|-------------------|--------------------------------------|
| 1 | POST sin `empresas` en body → 200 | Validación eliminada: ya no requiere `empresas` | Crea usuario con `empresa_id = 1` |
| 2 | POST con `empresas: []` → 200 | Array vacío ya no se rechaza (el backend ignora el campo) | Crea usuario con `empresa_id = 1` |
| 3 | PUT sin `empresas` en body → mantiene empresa_id=1 | El hardcodeo incondicional asegura que siempre hay asociación | Éxito, `usuario_empresa` tiene fila con `empresa_id = 1` |
| 4 | PUT con `empresas: [99]` → ignora el valor, usa 1 | El backend hardcodea — no confía en el input del cliente | `usuario_empresa` queda con `empresa_id = 1`, no 99 |
| 5 | Simulación: INSERT post-DELETE falla en PUT | El handler no tiene rollback — el DELETE ya ocurrió | Test documenta el riesgo; NO lo corrige (fuera de scope) |

### 2.3 Test 5 — decisión de diseño

El test 5 **simula el fallo del INSERT** mockeando `sql` para que:
1. Primera llamada (DELETE): resuelve ok
2. Segunda llamada (INSERT usuario_empresa): rechaza con error

El test verifica que el handler **no maneja este caso** (lanza excepción, no
hace rollback). Esto **no es un bug a corregir ahora** — es un riesgo aceptado
(documentado en §1.1). El test existe como guarda de regresión: si en el futuro
se agrega una transacción, este test debe actualizarse para verificar el
rollback.

---

## 3. Criterio de salida de Fase B

- [x] Riesgos identificados y documentados (§1.1–§1.4)
- [x] Riesgo de concurrencia analizado y descartado (§1.3)
- [x] Tests escritos — 5 tests, todos deben fallar contra el código actual (ROJO)
- [x] Test 5 documentado como riesgo aceptado, no como bug a corregir

---

## Resumen

| Métrica | Valor |
|---------|-------|
| Riesgos identificados | 4 |
| Riesgos aceptados (sin acción) | 2 (concurrencia descartada, dead import trivial) |
| Riesgos con test | 2 (DELETE+INSERT huérfano, POST sin validación) |
| Tests escritos | 5 |
| Archivos de test | 1 (`__tests__/api/usuarios.test.ts`) |
