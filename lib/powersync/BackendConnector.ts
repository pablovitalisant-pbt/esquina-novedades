import type {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
} from '@powersync/web';
import flags from '@/config/feature-flags.json';
import { reportarConflicto, extraerMensajeError } from './reportarConflicto';
import { toast } from 'sonner';

export class BackendConnector implements PowerSyncBackendConnector {
  /**
   * Obtiene el token de autenticación contra la instancia de PowerSync.
   *
   * Llama a nuestro propio endpoint (Slice 1), que valida la sesión de
   * next-auth y firma un JWT HS256 con el secreto configurado en el
   * dashboard. `credentials: 'include'` envía la cookie de sesión.
   *
   * A diferencia del demo oficial de PowerSync, acá sí hay backend propio:
   * un 401/500 debe ser un error visible, no un retorno `null` silencioso.
   */
  async fetchCredentials(): Promise<{ endpoint: string; token: string }> {
    const res = await fetch('/api/powersync/token', {
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error(
        `fetchCredentials falló: ${res.status} ${res.statusText}`
      );
    }
    const { token, endpoint } = await res.json();
    return { token, endpoint };
  }

  /**
   * Sube los cambios locales de `ubicaciones_bodega` al backend.
   *
   * Reutiliza el endpoint `PUT /api/ubicaciones/codigo/[codigo]` tal cual
   * (misma validación, mismo upsert por codigo) — cero lógica de negocio
   * duplicada.
   *
   * Nota: un `UPDATE` local genera un op `PATCH`, cuyo `opData` solo trae
   * las columnas cambiadas (ver UpdateType en @powersync/common). `codigo`
   * no cambia y no viene en `opData`, así que se resuelve por el id de fila
   * de PowerSync consultando la DB local.
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    // SÓLO se completa la transacción si todos los ops terminaron bien (2xx)
    // o con un 400 permanente. Ante una excepción de red o un status
    // reintentable (401, 500, etc.) se re-lanza SIN completar: PowerSync
    // reintenta automáticamente la cola. Completar en un `finally`
    // incondicional descartaba la escritura en fallos transitorios.
    let shouldComplete = true;
    // Slice 11b: los ops de caja_movimiento_notas no se suben dentro del loop
    // principal — se recolectan por movimiento_id y se suben post-proceso,
    // después de que el INSERT del movimiento correspondiente ya se aplicó.
    const movNotas = new Map<string, Array<{ op: any; data: any }>>();
    try {
      for (const op of transaction.crud) {
        if (op.table === 'ubicaciones_bodega') {
          const data = op.opData ?? {};
          const row = await database.get<{ codigo: string }>(
            'SELECT codigo FROM ubicaciones_bodega WHERE id = ?',
            [op.id]
          );
          const codigo = row?.codigo ?? data.codigo;
          if (!codigo) {
            console.error(`uploadData: fila sin codigo (op.id=${op.id}) — se descarta`);
            continue;
          }

          let res: Response;
          try {
            res = await fetch(`/api/ubicaciones/codigo/${codigo}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ubicacion: data.ubicacion ?? null,
                fisico_cajas: data.fisico_cajas ?? null,
                fisico_unidades: data.fisico_unidades ?? 0,
                observaciones: data.observaciones ?? null,
              }),
            });
          } catch (e) {
            // Excepción de red (offline, ERR_INTERNET_DISCONNECTED, etc.) →
            // no completar, reintento automático.
            console.error(`uploadData: excepción de red para ${codigo} — se reintentará`, e);
            shouldComplete = false;
            throw e;
          }

          if (res.ok) continue;

          if (res.status === 400) {
            // Error de validación real y permanente (ej. "Producto no encontrado"):
            // no tiene sentido reintentar; se descarta al completar.
            console.error(`uploadData: ${codigo} 400 (permanente) — se descarta`, res.status);
            // Slice 9b: reportar a la bandeja de conflictos (gateado por flag).
            // reportarConflicto falla en silencio y nunca afecta shouldComplete.
            if ((flags as any)['sync-conflictos-reporte']) {
              await reportarConflicto({
                tabla: op.table,
                operacion: op.op,
                entidad_id: codigo,
                payload: data,
                http_status: res.status,
                error_mensaje: await extraerMensajeError(res),
              });
            }
            continue;
          }

          // 401, 500 u otro status reintentable → no completar, reintento.
          console.error(`uploadData: ${codigo} ${res.status} — se reintentará`, res.status);
          shouldComplete = false;
          throw new Error(`uploadData: ${codigo} falló con ${res.status}`);
        } else if (op.table === 'prenota_items') {
          // BUG-052: branchear por tipo de op. El bloque original solo manejaba
          // el INSERT (PUT → POST agregar); PATCH y DELETE caían igual al POST
          // con data.prenota_id (undefined en un UPDATE — UpdateType solo trae
          // columnas cambiadas) → POST /api/notas-venta/undefined/items → 400/404.
          if (op.op === 'PUT') {
            // Slice 10b: agregar producto offline → POST /api/notas-venta/[prenota_id]/items.
            const data = op.opData ?? {};
            let res: Response;
            try {
              res = await fetch(`/api/notas-venta/${data.prenota_id}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: op.id,
                  codigo: data.codigo,
                  descripcion: data.descripcion,
                  imagen_url: data.imagen_url,
                  empresa_id: data.empresa_id,
                  cajas: data.cajas,
                  unidades: data.unidades,
                  precio: data.precio,
                  stock_referencia: data.stock_referencia,
                }),
              });
            } catch (e) {
              // Excepción de red → no completar, reintento automático.
              console.error(`uploadData: excepción de red para item ${op.id} — se reintentará`, e);
              shouldComplete = false;
              throw e;
            }
            if (res.ok) continue;
            // 400 (stock insuficiente), 404 (nota no encontrada) y 422 (nota
            // anulada) son respuestas de negocio permanentes → descartar + reportar.
            if ([400, 404, 422].includes(res.status)) {
              console.error(`uploadData: item ${op.id} ${res.status} (permanente) — se descarta`, res.status);
              const motivoPut = await extraerMensajeError(res);
              toast.error(`No se pudo agregar "${data.descripcion || data.codigo || 'producto'}" a la nota: ${motivoPut}`);
              if ((flags as any)['sync-conflictos-reporte']) {
                await reportarConflicto({
                  tabla: op.table,
                  operacion: op.op,
                  entidad_id: op.id,
                  payload: data,
                  http_status: res.status,
                  error_mensaje: motivoPut,
                });
              }
              continue;
            }
            // 401, 500 u otro status reintentable → no completar, reintento.
            console.error(`uploadData: item ${op.id} ${res.status} — se reintentará`, res.status);
            shouldComplete = false;
            throw new Error(`uploadData: item ${op.id} falló con ${res.status}`);
          } else if (op.op === 'PATCH') {
            // BUG-052: editar cantidad/precio offline. Un UPDATE no trae
            // prenota_id en opData (solo columnas cambiadas) → resolverlo localmente.
            const data = op.opData ?? {};
            const row = await database.get<{ prenota_id: number | null; codigo: string | null }>(
              'SELECT prenota_id, codigo FROM prenota_items WHERE id = ?',
              [op.id]
            );
            if (!row?.prenota_id) {
              // Fila editada y luego borrada offline antes de subir → no hay
              // nota que alcanzar. Descartar como conflicto permanente, no
              // reintentar ni bloquear el resto de la cola.
              console.error(`uploadData: item ${op.id} PATCH sin fila local — se descarta`, op.id);
              if ((flags as any)['sync-conflictos-reporte']) {
                await reportarConflicto({
                  tabla: op.table,
                  operacion: op.op,
                  entidad_id: op.id,
                  payload: data,
                  http_status: 404,
                  error_mensaje: 'Ítem no existe localmente (editado y borrado offline)',
                });
              }
              continue;
            }
            let res: Response;
            try {
              res = await fetch(`/api/notas-venta/${row.prenota_id}/items/${op.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  cajas: data.cajas,
                  unidades: data.unidades,
                  precio: data.precio,
                }),
              });
            } catch (e) {
              // Excepción de red → no completar, reintento automático.
              console.error(`uploadData: excepción de red para item ${op.id} — se reintentará`, e);
              shouldComplete = false;
              throw e;
            }
            if (res.ok) continue;
            // 400/404/422 = respuestas de negocio permanentes → descartar + reportar.
            if ([400, 404, 422].includes(res.status)) {
              console.error(`uploadData: item ${op.id} ${res.status} (permanente) — se descarta`, res.status);
              const motivoPatch = await extraerMensajeError(res);
              toast.error(`No se guardo el cambio en "${row.codigo || 'un producto'}": ${motivoPatch}. Se muestra el valor anterior.`);
              if ((flags as any)['sync-conflictos-reporte']) {
                await reportarConflicto({
                  tabla: op.table,
                  operacion: op.op,
                  entidad_id: op.id,
                  payload: data,
                  http_status: res.status,
                  error_mensaje: motivoPatch,
                });
              }
              continue;
            }
            // 401, 500 u otro status reintentable → no completar, reintento.
            console.error(`uploadData: item ${op.id} ${res.status} — se reintentará`, res.status);
            shouldComplete = false;
            throw new Error(`uploadData: item ${op.id} falló con ${res.status}`);
          } else if (op.op === 'DELETE') {
            // BUG-052: eliminar ítem offline. El server resuelve prenota_id
            // (la fila ya no existe localmente) — endpoint sin [id].
            let res: Response;
            try {
              res = await fetch(`/api/notas-venta/items/${op.id}`, { method: 'DELETE' });
            } catch (e) {
              // Excepción de red → no completar, reintento automático.
              console.error(`uploadData: excepción de red para item ${op.id} — se reintentará`, e);
              shouldComplete = false;
              throw e;
            }
            if (res.ok) continue;
            if (res.status === 404) {
              // ya no existe (borrado desde otro dispositivo o nunca llegó a
              // Neon) → convergencia, no es un conflicto real → descartar sin reportar.
              console.error(`uploadData: item ${op.id} 404 — convergencia, se descarta`, res.status);
              continue;
            }
            if (res.status === 422) {
              // nota anulada entretanto → descartar + reportar.
              console.error(`uploadData: item ${op.id} 422 (nota anulada) — se descarta`, res.status);
              const motivoDelete = await extraerMensajeError(res);
              toast.error(`No se pudo eliminar el producto: ${motivoDelete}`);
              if ((flags as any)['sync-conflictos-reporte']) {
                await reportarConflicto({
                  tabla: op.table,
                  operacion: op.op,
                  entidad_id: op.id,
                  payload: {},
                  http_status: res.status,
                  error_mensaje: motivoDelete,
                });
              }
              continue;
            }
            // 401, 500 u otro status reintentable → no completar, reintento.
            console.error(`uploadData: item ${op.id} ${res.status} — se reintentará`, res.status);
            shouldComplete = false;
            throw new Error(`uploadData: item ${op.id} falló con ${res.status}`);
          } else {
            // op desconocido (no debería pasar) → descartar sin romper la cola.
            console.error(`uploadData: item ${op.id} op desconocido ${op.op} — se descarta`, op.op);
            continue;
          }
        } else if (op.table === 'caja_movimientos') {
          // BUG-054: branchear por tipo de op. El bloque original solo manejaba
          // el INSERT (PUT → POST crear); PATCH y DELETE caían igual al POST y
          // el edit/delete se perdía o corrompía.
          if (op.op === 'PUT') {
            // Slice 11b: registrar cobro/gasto offline → POST /api/caja/movimientos.
            const data = op.opData ?? {};
            let res: Response;
            try {
              res = await fetch('/api/caja/movimientos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: op.id,
                  fecha: data.fecha,
                  tipo: data.tipo,
                  kcodcli2: data.kcodcli2 ?? null,
                  nombre_cliente: data.nombre_cliente ?? null,
                  cuenta_id: data.cuenta_id,
                  moneda: data.moneda,
                  monto: data.monto,
                  forma_pago: data.forma_pago,
                  observaciones: data.observaciones ?? null,
                  empresa: data.empresa ?? null,
                  es_credito: !!data.es_credito,
                  // Opción B (11b): capturar el tipo de cambio que el usuario vio
                  // al registrar — no re-derivar del servidor al sincronizar.
                  tipo_cambio_capturado: data.moneda === 'ARS' ? data.tipo_cambio : undefined,
                }),
              });
            } catch (e) {
              // Excepción de red → no completar, reintento automático.
              console.error(`uploadData: excepción de red para movimiento ${op.id} — se reintentará`, e);
              shouldComplete = false;
              throw e;
            }

            if (res.ok) continue;

            // 400/404/422 = respuestas de negocio permanentes → descartar + reportar.
            if ([400, 404, 422].includes(res.status)) {
              console.error(`uploadData: movimiento ${op.id} ${res.status} (permanente) — se descarta`, res.status);
              if ((flags as any)['sync-conflictos-reporte']) {
                await reportarConflicto({
                  tabla: op.table,
                  operacion: op.op,
                  entidad_id: op.id,
                  payload: data,
                  http_status: res.status,
                  error_mensaje: await extraerMensajeError(res),
                });
              }
              continue;
            }

            // 401, 500 u otro status reintentable → no completar, reintento.
            console.error(`uploadData: movimiento ${op.id} ${res.status} — se reintentará`, res.status);
            shouldComplete = false;
            throw new Error(`uploadData: movimiento ${op.id} falló con ${res.status}`);
          } else if (op.op === 'PATCH') {
            // BUG-054: editar movimiento offline. El endpoint ya resuelve
            // parciales (COALESCE + fallback) — se manda opData tal cual, con
            // UNA normalización: es_credito (PowerSync lo coacciona a 0/1; el
            // schema exige boolean). Solo si vino (no pisar el valor real si el
            // campo no se tocó — JSON.stringify descarta el undefined).
            const data = op.opData ?? {};
            const body = { ...data, es_credito: data.es_credito !== undefined ? !!data.es_credito : undefined };
            let res: Response;
            try {
              res = await fetch(`/api/caja/movimientos/${op.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              });
            } catch (e) {
              // Excepción de red → no completar, reintento automático.
              console.error(`uploadData: excepción de red para movimiento ${op.id} — se reintentará`, e);
              shouldComplete = false;
              throw e;
            }

            if (res.ok) continue;

            // 400/404/422 = respuestas de negocio permanentes → descartar + reportar.
            if ([400, 404, 422].includes(res.status)) {
              console.error(`uploadData: movimiento ${op.id} ${res.status} (permanente) — se descarta`, res.status);
              if ((flags as any)['sync-conflictos-reporte']) {
                await reportarConflicto({
                  tabla: op.table,
                  operacion: op.op,
                  entidad_id: op.id,
                  payload: data,
                  http_status: res.status,
                  error_mensaje: await extraerMensajeError(res),
                });
              }
              continue;
            }

            // 401, 500 u otro status reintentable → no completar, reintento.
            console.error(`uploadData: movimiento ${op.id} ${res.status} — se reintentará`, res.status);
            shouldComplete = false;
            throw new Error(`uploadData: movimiento ${op.id} falló con ${res.status}`);
          } else if (op.op === 'DELETE') {
            // BUG-054: eliminar movimiento offline. La cascada de imputaciones
            // (caja_movimiento_notas) la hace el servidor (ON DELETE CASCADE).
            let res: Response;
            try {
              res = await fetch(`/api/caja/movimientos/${op.id}`, { method: 'DELETE' });
            } catch (e) {
              // Excepción de red → no completar, reintento automático.
              console.error(`uploadData: excepción de red para movimiento ${op.id} — se reintentará`, e);
              shouldComplete = false;
              throw e;
            }
            if (res.ok) continue;
            if (res.status === 404) {
              // ya no existe (borrado desde otro dispositivo) → convergencia,
              // no es conflicto real → descartar sin reportar.
              console.error(`uploadData: movimiento ${op.id} 404 — convergencia, se descarta`, res.status);
              continue;
            }
            if (res.status === 422) {
              console.error(`uploadData: movimiento ${op.id} 422 — se descarta`, res.status);
              if ((flags as any)['sync-conflictos-reporte']) {
                await reportarConflicto({
                  tabla: op.table,
                  operacion: op.op,
                  entidad_id: op.id,
                  payload: {},
                  http_status: res.status,
                  error_mensaje: await extraerMensajeError(res),
                });
              }
              continue;
            }
            // 401, 500 u otro status reintentable → no completar, reintento.
            console.error(`uploadData: movimiento ${op.id} ${res.status} — se reintentará`, res.status);
            shouldComplete = false;
            throw new Error(`uploadData: movimiento ${op.id} falló con ${res.status}`);
          } else {
            // op desconocido → descartar sin romper la cola.
            console.error(`uploadData: movimiento ${op.id} op desconocido ${op.op} — se descarta`, op.op);
            continue;
          }
        } else if (op.table === 'caja_movimiento_notas') {
          // Se recolecta para el post-proceso (no se sube dentro del loop).
          const data = op.opData ?? {};
          const movId = data.movimiento_id;
          if (movId) {
            const arr = movNotas.get(movId) ?? [];
            arr.push({ op, data });
            movNotas.set(movId, arr);
          }
          continue;
        } else if (op.table === 'categorias' && op.op === 'PUT') {
          // Slice 12: creación offline de categoría.
          const data = op.opData ?? {};
          let res: Response;
          try {
            res = await fetch('/api/categorias', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: op.id, nombre: data.nombre }),
            });
          } catch (e) {
            console.error(`uploadData: excepción de red para categoría ${op.id} — se reintentará`, e);
            shouldComplete = false;
            throw e;
          }
          if (res.ok) continue;
          if (res.status === 400) {
            // nombre duplicado (23505) — caso de conflicto real (dos dispositivos
            // crean la misma categoría offline) → descartar + reportar.
            console.error(`uploadData: categoría ${op.id} 400 (permanente) — se descarta`, res.status);
            if ((flags as any)['sync-conflictos-reporte']) {
              await reportarConflicto({
                tabla: op.table,
                operacion: op.op,
                entidad_id: op.id,
                payload: data,
                http_status: res.status,
                error_mensaje: await extraerMensajeError(res),
              });
            }
            continue;
          }
          console.error(`uploadData: categoría ${op.id} ${res.status} — se reintentará`, res.status);
          shouldComplete = false;
          throw new Error(`uploadData: categoría ${op.id} falló con ${res.status}`);
        } else if (op.table === 'categorias' && op.op === 'DELETE') {
          // Slice 12: eliminación offline de categoría.
          let res: Response;
          try {
            res = await fetch(`/api/categorias/${op.id}`, { method: 'DELETE' });
          } catch (e) {
            console.error(`uploadData: excepción de red para categoría ${op.id} — se reintentará`, e);
            shouldComplete = false;
            throw e;
          }
          if (res.ok) continue;
          if (res.status === 404) {
            // ya no existe (borrada desde otro dispositivo) → convergencia, no
            // es un conflicto real → descartar sin reportar.
            console.error(`uploadData: categoría ${op.id} 404 — convergencia, se descarta`, res.status);
            continue;
          }
          console.error(`uploadData: categoría ${op.id} ${res.status} — se reintentará`, res.status);
          shouldComplete = false;
          throw new Error(`uploadData: categoría ${op.id} falló con ${res.status}`);
        } else if (op.table === 'productos' && op.op === 'PATCH') {
          // Slice 12/15: reasignación offline de categoría (12) o "no reponer"
          // (15) de un producto. Se reenvía el opData COMPLETO (el endpoint
          // filtra por whitelist server-side) — no solo {categoria}, porque con
          // una segunda columna editable (no_reponer) un body fijo dejaría el
          // cambio sin llegar a Postgres.
          const data = op.opData ?? {};
          let res: Response;
          try {
            res = await fetch(`/api/productos/${op.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            });
          } catch (e) {
            console.error(`uploadData: excepción de red para producto ${op.id} — se reintentará`, e);
            shouldComplete = false;
            throw e;
          }
          if (res.ok) continue;
          if ([400, 403, 404].includes(res.status)) {
            // "Categoria no valida" (aún no sincronizó la categoría desde otro
            // dispositivo), 403 (otra empresa), 404 → descartar + reportar.
            console.error(`uploadData: producto ${op.id} ${res.status} (permanente) — se descarta`, res.status);
            if ((flags as any)['sync-conflictos-reporte']) {
              await reportarConflicto({
                tabla: op.table,
                operacion: op.op,
                entidad_id: op.id,
                payload: data,
                http_status: res.status,
                error_mensaje: await extraerMensajeError(res),
              });
            }
            continue;
          }
          console.error(`uploadData: producto ${op.id} ${res.status} — se reintentará`, res.status);
          shouldComplete = false;
          throw new Error(`uploadData: producto ${op.id} falló con ${res.status}`);
        } else if (op.table === 'prenotas' && op.op === 'PATCH') {
          // Slice 14: anular nota offline → estado = 'anulada'.
          // Solo se muta prenotas.estado localmente; se reutiliza
          // DELETE /api/notas-venta/[id] tal cual (chequeo de pago + anula +
          // restaura stock, atómico server-side).
          let res: Response;
          try {
            res = await fetch(`/api/notas-venta/${op.id}`, { method: 'DELETE' });
          } catch (e) {
            console.error(`uploadData: excepción de red para nota ${op.id} — se reintentará`, e);
            shouldComplete = false;
            throw e;
          }
          if (res.ok) continue;
          if (res.status === 409) {
            // pago registrado (carrera: se pagó desde otro dispositivo entre el
            // chequeo local y el sync) → descartar + reportar conflicto real.
            console.error(`uploadData: nota ${op.id} 409 (pago registrado) — se descarta`, res.status);
            if ((flags as any)['sync-conflictos-reporte']) {
              await reportarConflicto({
                tabla: op.table,
                operacion: op.op,
                entidad_id: op.id,
                payload: { estado: 'anulada' },
                http_status: res.status,
                error_mensaje: await extraerMensajeError(res),
              });
            }
            continue;
          }
          if (res.status === 404) {
            // ya anulada (convergencia, anulada desde otro dispositivo) →
            // descartar sin reportar.
            console.error(`uploadData: nota ${op.id} 404 — convergencia, se descarta`, res.status);
            continue;
          }
          console.error(`uploadData: nota ${op.id} ${res.status} — se reintentará`, res.status);
          shouldComplete = false;
          throw new Error(`uploadData: nota ${op.id} falló con ${res.status}`);
        } else if (op.table === 'clientes' && op.op === 'PUT') {
          // Slice 13b: creación offline de cliente.
          const data = op.opData ?? {};
          let res: Response;
          try {
            res = await fetch('/api/clientes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: op.id, nombre: data.nombre, telefono: data.telefono, direccion: data.direccion, notas: data.notas }),
            });
          } catch (e) {
            console.error(`uploadData: excepción de red para cliente ${op.id} — se reintentará`, e);
            shouldComplete = false;
            throw e;
          }
          if (res.ok) continue;
          if (res.status === 400) {
            // nombre vacío (no debería pasar, el form local valida) → reportar.
            console.error(`uploadData: cliente ${op.id} 400 (permanente) — se descarta`, res.status);
            if ((flags as any)['sync-conflictos-reporte']) {
              await reportarConflicto({ tabla: op.table, operacion: op.op, entidad_id: op.id, payload: data, http_status: res.status, error_mensaje: await extraerMensajeError(res) });
            }
            continue;
          }
          console.error(`uploadData: cliente ${op.id} ${res.status} — se reintentará`, res.status);
          shouldComplete = false;
          throw new Error(`uploadData: cliente ${op.id} falló con ${res.status}`);
        } else if (op.table === 'clientes' && op.op === 'PATCH') {
          // Slice 13b: edición offline de cliente (solo columnas cambiadas).
          const data = op.opData ?? {};
          let res: Response;
          try {
            res = await fetch(`/api/clientes/${op.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            });
          } catch (e) {
            console.error(`uploadData: excepción de red para cliente ${op.id} — se reintentará`, e);
            shouldComplete = false;
            throw e;
          }
          if (res.ok) continue;
          if (res.status === 404) {
            // cliente ya no existe (borrado desde otro dispositivo) → reportar.
            console.error(`uploadData: cliente ${op.id} 404 — se descarta`, res.status);
            if ((flags as any)['sync-conflictos-reporte']) {
              await reportarConflicto({ tabla: op.table, operacion: op.op, entidad_id: op.id, payload: data, http_status: res.status, error_mensaje: await extraerMensajeError(res) });
            }
            continue;
          }
          console.error(`uploadData: cliente ${op.id} ${res.status} — se reintentará`, res.status);
          shouldComplete = false;
          throw new Error(`uploadData: cliente ${op.id} falló con ${res.status}`);
        } else if (op.table === 'clientes' && op.op === 'DELETE') {
          // Slice 13b: eliminación offline de cliente (cascada server-side al sync).
          let res: Response;
          try {
            res = await fetch(`/api/clientes/${op.id}`, { method: 'DELETE' });
          } catch (e) {
            console.error(`uploadData: excepción de red para cliente ${op.id} — se reintentará`, e);
            shouldComplete = false;
            throw e;
          }
          if (res.ok) continue;
          if (res.status === 404) {
            // ya no existe (convergencia) → descartar sin reportar.
            console.error(`uploadData: cliente ${op.id} 404 — convergencia, se descarta`, res.status);
            continue;
          }
          if (res.status === 409) {
            // se creó una nota/movimiento para este cliente entre el chequeo
            // local y el sync → conflicto real → reportar.
            console.error(`uploadData: cliente ${op.id} 409 — se descarta`, res.status);
            if ((flags as any)['sync-conflictos-reporte']) {
              await reportarConflicto({ tabla: op.table, operacion: op.op, entidad_id: op.id, payload: {}, http_status: res.status, error_mensaje: await extraerMensajeError(res) });
            }
            continue;
          }
          console.error(`uploadData: cliente ${op.id} ${res.status} — se reintentará`, res.status);
          shouldComplete = false;
          throw new Error(`uploadData: cliente ${op.id} falló con ${res.status}`);
        } else if (op.table === 'alertas_stock_bajo' && op.op === 'PUT') {
          // Slice 15: "ignorar" una alerta offline. Reutiliza el endpoint
          // existente (PUT /api/alertas-stock/[id]) — su INSERT ON CONFLICT
          // DO NOTHING es idempotente, así que no hay 400/404 de negocio.
          const data = op.opData ?? {};
          let res: Response;
          try {
            res = await fetch(`/api/alertas-stock/${data.producto_id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accion: 'ignorar' }),
            });
          } catch (e) {
            console.error(`uploadData: excepción de red para alerta ${op.id} — se reintentará`, e);
            shouldComplete = false;
            throw e;
          }
          if (res.ok) continue;
          console.error(`uploadData: alerta ${op.id} ${res.status} — se reintentará`, res.status);
          shouldComplete = false;
          throw new Error(`uploadData: alerta ${op.id} falló con ${res.status}`);
        } else if (op.table === 'caja_config' && op.op === 'PATCH') {
          // Slice 17: editar dólar del día offline (upsert por clave fija).
          const data = op.opData ?? {};
          let res: Response;
          try {
            res = await fetch('/api/caja/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dolar_dia: parseFloat(data.valor) }),
            });
          } catch (e) {
            console.error(`uploadData: excepción de red para config — se reintentará`, e);
            shouldComplete = false;
            throw e;
          }
          if (res.ok) continue;
          if (res.status === 400) {
            console.error(`uploadData: config 400 — se descarta`, res.status);
            if ((flags as any)['sync-conflictos-reporte']) {
              await reportarConflicto({ tabla: op.table, operacion: op.op, entidad_id: op.id, payload: data, http_status: res.status, error_mensaje: await extraerMensajeError(res) });
            }
            continue;
          }
          console.error(`uploadData: config ${res.status} — se reintentará`, res.status);
          shouldComplete = false;
          throw new Error(`uploadData: config falló con ${res.status}`);
        } else if (op.table === 'caja_cuentas' && op.op === 'PATCH') {
          // Slice 17: editar/activar/desactivar cuenta offline (existente).
          const data = op.opData ?? {};
          const body: Record<string, any> = {};
          if (data.nombre !== undefined) body.nombre = data.nombre;
          if (data.moneda !== undefined) body.moneda = data.moneda;
          if (data.orden !== undefined) body.orden = data.orden;
          if (data.activa !== undefined) body.activa = !!Number(data.activa);
          let res: Response;
          try {
            res = await fetch(`/api/caja/cuentas/${op.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
          } catch (e) {
            console.error(`uploadData: excepción de red para cuenta ${op.id} — se reintentará`, e);
            shouldComplete = false;
            throw e;
          }
          if (res.ok) continue;
          if (res.status === 404) {
            // ya no existe (convergencia) → descartar sin reportar.
            console.error(`uploadData: cuenta ${op.id} 404 — convergencia, se descarta`, res.status);
            continue;
          }
          if (res.status === 409 || res.status === 400) {
            // 409 = R4 (tiene movimientos, no se puede desactivar) → conflicto real.
            console.error(`uploadData: cuenta ${op.id} ${res.status} — se descarta`, res.status);
            if ((flags as any)['sync-conflictos-reporte']) {
              await reportarConflicto({ tabla: op.table, operacion: op.op, entidad_id: op.id, payload: data, http_status: res.status, error_mensaje: await extraerMensajeError(res) });
            }
            continue;
          }
          console.error(`uploadData: cuenta ${op.id} ${res.status} — se reintentará`, res.status);
          shouldComplete = false;
          throw new Error(`uploadData: cuenta ${op.id} falló con ${res.status}`);
        } else if (op.table === 'caja_saldos_iniciales' && op.op === 'PATCH') {
          // Slice 17: editar saldo inicial offline. Mismo endpoint que crear
          // (upsert por cuenta_id). Debe mandar cuenta_id (el UPDATE local
          // siempre lo incluye en opData).
          const data = op.opData ?? {};
          let res: Response;
          try {
            res = await fetch('/api/caja/saldos-iniciales', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cuenta_id: Number(data.cuenta_id), fecha: data.fecha, saldo: parseFloat(data.saldo), observaciones: data.observaciones ?? null }),
            });
          } catch (e) {
            console.error(`uploadData: excepción de red para saldo ${op.id} — se reintentará`, e);
            shouldComplete = false;
            throw e;
          }
          if (res.ok) continue;
          if (res.status === 400) {
            console.error(`uploadData: saldo ${op.id} 400 — se descarta`, res.status);
            if ((flags as any)['sync-conflictos-reporte']) {
              await reportarConflicto({ tabla: op.table, operacion: op.op, entidad_id: op.id, payload: data, http_status: res.status, error_mensaje: await extraerMensajeError(res) });
            }
            continue;
          }
          console.error(`uploadData: saldo ${op.id} ${res.status} — se reintentará`, res.status);
          shouldComplete = false;
          throw new Error(`uploadData: saldo ${op.id} falló con ${res.status}`);
        } else if (op.table === 'caja_saldos_iniciales' && op.op === 'DELETE') {
          // Slice 17: eliminar saldo inicial offline (existente).
          let res: Response;
          try {
            res = await fetch(`/api/caja/saldos-iniciales/${op.id}`, { method: 'DELETE' });
          } catch (e) {
            console.error(`uploadData: excepción de red para saldo ${op.id} — se reintentará`, e);
            shouldComplete = false;
            throw e;
          }
          if (res.ok) continue;
          if (res.status === 404) {
            // ya no existe (convergencia) → descartar sin reportar.
            console.error(`uploadData: saldo ${op.id} 404 — convergencia, se descarta`, res.status);
            continue;
          }
          console.error(`uploadData: saldo ${op.id} ${res.status} — se reintentará`, res.status);
          shouldComplete = false;
          throw new Error(`uploadData: saldo ${op.id} falló con ${res.status}`);
        }
      }

      // ─── Post-proceso: subir las imputaciones de caja_movimiento_notas ───
      // Array.from(entries()) para no depender de iterar un Map (target es5).
      for (const [movimientoId, grupo] of Array.from(movNotas.entries())) {
        const notas = grupo.map((g) => ({
          prenota_id: g.data.prenota_id,
          monto_aplicado: g.data.monto_aplicado,
        }));
        let res: Response;
        try {
          res = await fetch(`/api/caja/movimientos/${movimientoId}/notas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notas }),
          });
        } catch (e) {
          // Excepción de red → no completar, reintento (idempotente en el endpoint).
          console.error(`uploadData: excepción de red para notas de ${movimientoId} — se reintentará`, e);
          shouldComplete = false;
          throw e;
        }

        if (res.ok) continue;

        if ([400, 404, 422].includes(res.status)) {
          console.error(`uploadData: notas de ${movimientoId} ${res.status} (permanente) — se descarta`, res.status);
          if ((flags as any)['sync-conflictos-reporte']) {
            await reportarConflicto({
              tabla: 'caja_movimiento_notas',
              operacion: 'PUT',
              entidad_id: movimientoId,
              payload: { notas },
              http_status: res.status,
              error_mensaje: await extraerMensajeError(res),
            });
          }
          continue;
        }

        // 401, 500 u otro status reintentable → no completar, reintento.
        console.error(`uploadData: notas de ${movimientoId} ${res.status} — se reintentará`, res.status);
        shouldComplete = false;
        throw new Error(`uploadData: notas de ${movimientoId} falló con ${res.status}`);
      }
    } finally {
      if (shouldComplete) await transaction.complete();
    }
  }
}
