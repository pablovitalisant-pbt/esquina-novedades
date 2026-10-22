/**
 * FASE B — BUG-052: PATCH y DELETE offline de ítems de Notas de Venta.
 *
 * Capa probada: `BackendConnector.uploadData()` (la sincronización), NO el
 * componente UI (ese ya escribe localmente bien — ver notas-venta-guardar-offline).
 *
 * El bloque `prenota_items` actual solo maneja el caso INSERT (op.op === 'PUT' →
 * POST). Cuando PowerSync genera ops `PATCH` (editar cantidad/precio) y `DELETE`
 * (eliminar ítem), el código actual los manda igual al POST de agregar con
 * `data.prenota_id`, que en un UPDATE no trae prenota_id (UpdateType solo trae
 * columnas cambiadas) → `POST /api/notas-venta/undefined/items` → 400/404.
 *
 * Estos tests se escriben ANTES de la implementación (TDD) y deben quedar ROJOS
 * contra el código actual, VERDES contra el fix:
 *   R1  PATCH con fila local presente → resuelve prenota_id y llama el endpoint correcto.
 *   R2  PATCH sobre fila local inexistente (editada y borrada offline) → se
 *       descarta como conflicto, no bloquea el resto de la cola.
 *   R3  DELETE con nota anulada entretanto (422) → descarta + reporta, no reintenta.
 *   R4  DELETE de ítem que el servidor ya no tiene (404) → éxito, no reintenta.
 *   R5  DELETE con status reintentable (500) → no completa, relanza (reintento).
 *   R6  Smoke E2E: 3 notas (PUT a A, PATCH a B, DELETE a C) → 3 syncs correctos.
 */

import { BackendConnector } from '@/lib/powersync/BackendConnector';

const toastError = jest.fn();
jest.mock('sonner', () => ({ toast: { error: (...args: any[]) => toastError(...args) } }));
import { reportarConflicto } from '@/lib/powersync/reportarConflicto';

jest.mock('@/lib/powersync/reportarConflicto', () => ({
  reportarConflicto: jest.fn(async () => {}),
  extraerMensajeError: jest.fn(async () => null),
}));

// Activar el reporte de conflictos para poder asertar que se llama.
jest.mock('@/config/feature-flags.json', () => ({
  'sync-conflictos-reporte': true,
}));

const mockedReportar = reportarConflicto as jest.Mock;

// fetch global configurable por URL exacta.
let fetchPlan: Record<string, { status: number }> = {};
const fetchMock = jest.fn(async (url: string | URL, reqOpts?: RequestInit) => {
  const urlStr = typeof url === 'string' ? url : url.toString();
  const key = `${reqOpts?.method ?? 'GET'} ${urlStr}`;
  const plan = fetchPlan[key] ?? { status: 200 };
  return {
    ok: plan.status >= 200 && plan.status < 300,
    status: plan.status,
    json: async () => ({ error: 'mock' }),
  } as unknown as Response;
});

// DB local PowerSync: transacción con ops + filas locales por id.
let crudOps: any[] = [];
let localRows: Record<string, any> = {};
const complete = jest.fn(async () => {});
const database = {
  getNextCrudTransaction: jest.fn(async () => ({ crud: crudOps, complete })),
  get: jest.fn(async (sql: string, params: any[]) => {
    if (sql.includes('FROM prenota_items WHERE id =')) {
      return localRows[params[0]] ?? null;
    }
    return null;
  }),
};

const connector = new BackendConnector();
const makeOp = (overrides: Partial<any>) => ({
  table: 'prenota_items',
  op: 'PUT',
  id: 'uuid-x',
  opData: {},
  ...overrides,
});

const fetchCallsFor = (method: string, urlPart: string) =>
  (fetchMock as jest.Mock).mock.calls.filter(
    (c: any[]) =>
      (c[1]?.method ?? 'GET') === method &&
      (typeof c[0] === 'string' ? c[0] : c[0].toString()).includes(urlPart)
  );

beforeEach(() => {
  jest.clearAllMocks();
  toastError.mockClear();
  crudOps = [];
  localRows = {};
  fetchPlan = {};
  (global as any).fetch = fetchMock as any;
});

describe('BUG-052 — PATCH offline de ítem', () => {
  it('R1: PATCH con fila local presente → resuelve prenota_id y llama el endpoint correcto', async () => {
    localRows['uuid-1'] = { prenota_id: 5 };
    crudOps = [makeOp({ op: 'PATCH', id: 'uuid-1', opData: { cajas: 2, unidades: 4, precio: 12 } })];

    await connector.uploadData(database as any);

    const patch = fetchCallsFor('PATCH', '/items/uuid-1');
    expect(patch.length).toBe(1);
    expect(String(patch[0][0])).toBe('/api/notas-venta/5/items/uuid-1');
    expect(JSON.parse((patch[0][1] as RequestInit).body as string)).toEqual({
      cajas: 2, unidades: 4, precio: 12,
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('R2: PATCH sobre fila local inexistente (editada y borrada offline) → descarta como conflicto, no bloquea la cola', async () => {
    // Sin entrada en localRows → database.get devuelve null (fila ya borrada localmente).
    crudOps = [makeOp({ op: 'PATCH', id: 'uuid-desaparecido', opData: { cajas: 3 } })];

    await connector.uploadData(database as any);

    // NO llama a ningún fetch PATCH (no hay prenota_id que resolver).
    expect(fetchCallsFor('PATCH', '/items/').length).toBe(0);
    // Reporta conflicto (no reintenta) y completa la transacción → no bloquea el resto.
    expect(mockedReportar).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
  });
});

describe('BUG-umed-corrupto — aviso al usuario cuando el servidor rechaza un PATCH', () => {
  it('R7: PATCH con 400 (stock insuficiente) → descarta, reporta y avisa con toast mencionando el codigo', async () => {
    localRows['uuid-1'] = { prenota_id: 5, codigo: 'Gl81299-1' };
    crudOps = [makeOp({ op: 'PATCH', id: 'uuid-1', opData: { cajas: 12, unidades: 240 } })];
    fetchPlan = { 'PATCH /api/notas-venta/5/items/uuid-1': { status: 400 } };

    await connector.uploadData(database as any);

    expect(mockedReportar).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0][0])).toMatch(/Gl81299-1/);
  });
});

describe('BUG-052 — DELETE offline de ítem', () => {
  it('R3: DELETE con nota anulada entretanto (422) → descarta + reporta, no reintenta', async () => {
    crudOps = [makeOp({ op: 'DELETE', id: 'uuid-1' })];
    fetchPlan = { 'DELETE /api/notas-venta/items/uuid-1': { status: 422 } };

    await connector.uploadData(database as any);

    const del = fetchCallsFor('DELETE', '/items/uuid-1');
    expect(del.length).toBe(1);
    expect(String(del[0][0])).toBe('/api/notas-venta/items/uuid-1');
    expect(mockedReportar).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1); // no reintenta
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('R4: DELETE de ítem que el servidor ya no tiene (404) → éxito, no reintenta ni reporta', async () => {
    crudOps = [makeOp({ op: 'DELETE', id: 'uuid-1' })];
    fetchPlan = { 'DELETE /api/notas-venta/items/uuid-1': { status: 404 } };

    await connector.uploadData(database as any);

    const del = fetchCallsFor('DELETE', '/items/uuid-1');
    expect(del.length).toBe(1);
    // convergencia → sin reportar conflicto
    expect(mockedReportar).toHaveBeenCalledTimes(0);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('R5: DELETE con status reintentable (500) → no completa, relanza (reintento)', async () => {
    crudOps = [makeOp({ op: 'DELETE', id: 'uuid-1' })];
    fetchPlan = { 'DELETE /api/notas-venta/items/uuid-1': { status: 500 } };

    await expect(connector.uploadData(database as any)).rejects.toThrow();

    expect(fetchCallsFor('DELETE', '/items/uuid-1').length).toBe(1);
    expect(complete).not.toHaveBeenCalled(); // shouldComplete=false
  });
});

describe('BUG-052 — Smoke E2E: 3 notas offline, una operación distinta en cada una', () => {
  it('R6: agregar a A (PUT), editar en B (PATCH), eliminar en C (DELETE) → las 3 sincronizan en su nota', async () => {
    localRows['uuid-b'] = { prenota_id: 2 };
    crudOps = [
      // Agregar producto a nota A → PUT (INSERT): opData trae prenota_id completo.
      makeOp({ id: 'uuid-a', opData: { prenota_id: 1, codigo: 'A-001', cajas: 1, unidades: 2, precio: 10, empresa_id: 1 } }),
      // Editar cantidad en nota B → PATCH: resuelve prenota_id local (2).
      makeOp({ op: 'PATCH', id: 'uuid-b', opData: { unidades: 5 } }),
      // Eliminar producto en nota C → DELETE: el server resuelve prenota_id.
      makeOp({ op: 'DELETE', id: 'uuid-c' }),
    ];

    await connector.uploadData(database as any);

    const postA = fetchCallsFor('POST', '/api/notas-venta/1/items');
    expect(postA.length).toBe(1);
    expect(String(postA[0][0])).toBe('/api/notas-venta/1/items');

    const patchB = fetchCallsFor('PATCH', '/api/notas-venta/2/items/uuid-b');
    expect(patchB.length).toBe(1);

    const delC = fetchCallsFor('DELETE', '/api/notas-venta/items/uuid-c');
    expect(delC.length).toBe(1);

    expect(complete).toHaveBeenCalledTimes(1);
  });
});
