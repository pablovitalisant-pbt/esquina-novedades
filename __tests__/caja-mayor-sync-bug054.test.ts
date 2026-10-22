/**
 * FASE B — BUG-054 (Parte 2): PATCH y DELETE offline de movimientos de Caja
 * Mayor en `BackendConnector.uploadData()`.
 *
 * El bloque `caja_movimientos` actual solo maneja `op.op === 'PUT'` (registrar
 * cobro/gasto → POST). Cuando PowerSync genera ops `PATCH` (editar) y `DELETE`
 * (eliminar), el código los manda igual al POST de crear → el edit/delete se
 * pierde o corrompe.
 *
 * La rama PATCH manda `opData` tal cual al endpoint existente (que ya resuelve
 * parciales — COALESCE + fallback), con UNA normalización obligatoria:
 * `es_credito` (PowerSync lo coacciona a integer 0/1; el schema exige boolean).
 * Debe aplicarse SOLO si vino (`!== undefined`), para no pisar el valor real
 * cuando el campo no se tocó (verificado contra BUG-048).
 *
 * R1  PATCH edita offline → PATCH al endpoint, opData + es_credito normalizado.
 * R2  DELETE offline → DELETE al endpoint (cascada de imputaciones server-side).
 * R2b DELETE 404 → convergencia (no reporta, no reintenta).
 * R2c DELETE 500 → no completa, relanza (reintento).
 * R5  PATCH SOLO es_credito → coaccionado a boolean y NO pisa otros campos.
 */

import { BackendConnector } from '@/lib/powersync/BackendConnector';
import { reportarConflicto } from '@/lib/powersync/reportarConflicto';

jest.mock('@/lib/powersync/reportarConflicto', () => ({
  reportarConflicto: jest.fn(async () => {}),
  extraerMensajeError: jest.fn(async () => null),
}));

jest.mock('@/config/feature-flags.json', () => ({
  'sync-conflictos-reporte': true,
}));

const mockedReportar = reportarConflicto as jest.Mock;

let crudOps: any[] = [];
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

const complete = jest.fn(async () => {});
const database = {
  getNextCrudTransaction: jest.fn(async () => ({ crud: crudOps, complete })),
  get: jest.fn(async () => null),
};

const connector = new BackendConnector();
const makeOp = (overrides: Partial<any>) => ({
  table: 'caja_movimientos',
  op: 'PUT',
  id: 'mov-1',
  opData: {},
  ...overrides,
});

const callsFor = (method: string, urlPart: string) =>
  (fetchMock as jest.Mock).mock.calls.filter(
    (c: any[]) =>
      (c[1]?.method ?? 'GET') === method &&
      (typeof c[0] === 'string' ? c[0] : c[0].toString()).includes(urlPart)
  );
const bodyOf = (call: any[]) => JSON.parse((call[1] as RequestInit).body as string);

beforeEach(() => {
  jest.clearAllMocks();
  crudOps = [];
  fetchPlan = {};
  (global as any).fetch = fetchMock as any;
});

describe('BUG-054 — PATCH offline de movimiento (rama caja_movimientos)', () => {
  it('R1: PATCH edita offline → PATCH al endpoint con opData + es_credito normalizado', async () => {
    crudOps = [makeOp({ op: 'PATCH', id: 'mov-1', opData: { observaciones: 'nueva', es_credito: 0 } })];

    await connector.uploadData(database as any);

    const call = callsFor('PATCH', '/api/caja/movimientos/mov-1');
    expect(call.length).toBe(1);
    expect(String(call[0][0])).toBe('/api/caja/movimientos/mov-1');
    expect(bodyOf(call[0])).toEqual({ observaciones: 'nueva', es_credito: false });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('R5: PATCH solo es_credito → coaccionado a boolean y NO pisa otros campos', async () => {
    crudOps = [makeOp({ op: 'PATCH', id: 'mov-1', opData: { es_credito: 1 } })];

    await connector.uploadData(database as any);

    const call = callsFor('PATCH', '/api/caja/movimientos/mov-1');
    expect(call.length).toBe(1);
    // exacto: no agrega nulls para campos ausentes (preserva la distinción
    // "no vino" vs "vino en null").
    expect(bodyOf(call[0])).toEqual({ es_credito: true });
    expect(complete).toHaveBeenCalledTimes(1);
  });
});

describe('BUG-054 — DELETE offline de movimiento (rama caja_movimientos)', () => {
  it('R2: DELETE elimina offline → DELETE al endpoint (cascada de imputaciones server-side)', async () => {
    crudOps = [makeOp({ op: 'DELETE', id: 'mov-1' })];

    await connector.uploadData(database as any);

    const call = callsFor('DELETE', '/api/caja/movimientos/mov-1');
    expect(call.length).toBe(1);
    expect(String(call[0][0])).toBe('/api/caja/movimientos/mov-1');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('R2b: DELETE 404 → convergencia (no reporta, no reintenta)', async () => {
    crudOps = [makeOp({ op: 'DELETE', id: 'mov-1' })];
    fetchPlan = { 'DELETE /api/caja/movimientos/mov-1': { status: 404 } };

    await connector.uploadData(database as any);

    expect(mockedReportar).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('R2c: DELETE 500 → no completa, relanza (reintento)', async () => {
    crudOps = [makeOp({ op: 'DELETE', id: 'mov-1' })];
    fetchPlan = { 'DELETE /api/caja/movimientos/mov-1': { status: 500 } };

    await expect(connector.uploadData(database as any)).rejects.toThrow();

    expect(complete).not.toHaveBeenCalled();
  });
});
