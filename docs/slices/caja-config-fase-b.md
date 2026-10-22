# Slice: Config de caja — limpieza post-Verificación (PRD §3 fila 7)

## Fase B — Análisis de riesgos

**Fecha:** 2026-07-05

---

## 1. Riesgos que NO aplican (decisión consciente, no omisión)

### 1.1 Renderizado condicional / UI flickering

**SÍ aplica — es el único riesgo real de este slice.** Se eliminan 3 estados
(`dolarObsLoading`, `dolarObsMeta`, función `handleObtenerDolarObservado`) y
el JSX que los consume (botón "Dólar observado" + párrafo de metadata). Si
queda alguna referencia huérfana a estos estados en el JSX remanente, React
lanza `ReferenceError` en runtime.

**Mitigación:** el test de Fase B renderiza `CajaConfigClient` con props mock
y verifica: (a) el botón "Dólar observado" NO está en el DOM, (b) el timestamp
de "Última actualización" usa formato `es-BO`, (c) el componente no lanza
errores de renderizado.

### 1.2 INSERT / UPDATE / DELETE en base de datos

**No aplica.** No se toca ninguna ruta API, query SQL, migración, seed, ni
schema. Las eliminaciones son exclusivamente de UI (estados + JSX) y el
cambio de locale es cosmético en strings de formato.

### 1.3 JOIN o integridad referencial entre tablas

**No aplica.** Sin cambios en queries, schema, o migraciones.

### 1.4 API externa / network failure

**No aplica.** Al contrario: se ELIMINA la única llamada a API externa del
módulo (`fetch("/api/caja/dolar-observado")` — ruta que ya no existe desde
Slice 2). El tipo de cambio sigue ingresándose manualmente, sin dependencia
de red.

### 1.5 Async / condiciones de carrera / concurrencia

**No aplica.** `handleObtenerDolarObservado` era la única función async que
se elimina. Sin operaciones asincrónicas nuevas ni modificadas.

### 1.6 Variables de entorno

**No aplica.** `es-BO` es un locale de ICU incluido en Node.js — no requiere
variables de entorno, polyfills, ni configuración adicional.

### 1.7 Estado compartido / Context / Store

**No aplica.** Los estados eliminados (`dolarObsLoading`, `dolarObsMeta`) son
locales al componente `CajaConfigClient`. No se comparten vía Context, props
drilling, ni store externo.

---

## 2. El "test que intenta romper" para este slice

Un test de renderizado que monta `CajaConfigClient` con datos mock y verifica
tres condiciones de contrato:

1. **Ausencia del botón eliminado:** `screen.queryByText("Dólar observado")`
   retorna `null`.
2. **Timestamp con formato boliviano:** el texto de "Última actualización"
   contiene una fecha en formato `es-BO` (barras `/`, no guiones `-`).
3. **Sin errores de consola:** `console.error` no es llamado durante el
   renderizado (detecta referencias huérfanas a estados eliminados).

---

## 3. Riesgo específico: `RefreshCw` en otros componentes

`RefreshCw` se elimina del import de lucide-react en `caja-config/client_page.tsx`.
Verificación: `RefreshCw` solo se usaba en el botón eliminado (línea 346). Ningún
otro componente en `client_page.tsx` lo referenciaba. El import reducido no rompe
otros componentes porque es un import con nombre, no un default.

---

## 4. Riesgo específico: smoke tests existentes

3 smoke tests referencian `caja-config/client_page.tsx`:

| Smoke test | Qué verifica | ¿Afectado? |
|------------|-------------|:--:|
| `slice14-cajas-smoke.test.ts` | NO contiene "Banco Central", "Santander", SÍ contiene "Caja chica" | No — no verifica "Dólar observado" ni formato de fecha |
| `slice4-clp-ars-smoke.test.ts` | NO contiene "CLP", "Pesos chilenos", SÍ contiene "Pesos argentinos" | No — no verifica "Dólar observado" ni `es-CL` literal |
| `slice2-build-smoke.test.ts` | Confirma que el archivo existe | No — el archivo sigue existiendo |

**Conclusión:** los 3 smoke tests pasan sin cambios. El texto "Dólar observado"
no aparece en ninguna aserción de smoke test.

---

## 5. Criterio de salida de Fase B

- [x] 7 categorías de riesgo analizadas — 6 no aplican, 1 aplica (§1.1)
- [x] Estrategia de "test que rompe" definida (§2): renderizado + ausencia + formato
- [x] Riesgos específicos analizados (§3, §4): imports huérfanos y smoke tests
- [x] Smoke tests existentes verificados — no requieren cambios

---

## Resumen

| Métrica | Valor |
|---------|-------|
| Riesgos de los 7 tipos que aplican | 1 (renderizado condicional) |
| Riesgos específicos | 2 (import huérfano, smoke tests — ambos descartados) |
| Estrategia de verificación | Test de renderizado + smoke tests existentes |
