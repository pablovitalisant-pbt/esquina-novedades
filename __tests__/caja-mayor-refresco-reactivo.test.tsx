/**
 * @jest-environment jsdom
 *
 * FASE B — Refresco reactivo de la tabla de Caja Mayor (onChangeWithCallback).
 *
 * Diagnóstico (DIAG-054c/d, ya revertido): tras editar un movimiento offline, el
 * UPDATE local sí persiste fresco en SQLite (la lectura trae el monto nuevo), pero
 * la tabla no lo muestra hasta otra invocación manual de fetchMovimientos — no hay
 * reactividad ante cambios en las tablas locales.
 *
 * Fix: suscribirse a db.onChangeWithCallback sobre las 4 tablas locales relevantes
 * (caja_movimientos, caja_movimiento_notas, caja_saldos_iniciales, caja_cierres)
 * para que cualquier cambio (escritura local u sync en background) dispare
 * fetchMovimientos + fetchSaldos automáticamente.
 *
 * R1  El efecto se suscribe con las 4 tablas (wiring nuevo → ROJO sin watcher).
 * R2  UPDATE local → el watcher refleja el cambio SIN una segunda invocación manual.
 * R3  El handler no genera loop (la lectura no re-dispara la suscripción).
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { CajaMayorClient } from '@/app/(app)/caja-mayor/client_page';

let offlineFlag = true;
jest.mock('@/config/feature-flags.json', () => ({
  get 'caja-mayor-offline-lectura'() { return offlineFlag; },
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

// DB local: onChangeWithCallback expone un spy; el handler que el efecto registra
// queda capturado para poder simular un cambio local.
const dbItems: any = { movimientos: [] };
let capturedOnChange: (() => void) | null = null;
const dbMock = {
  get: jest.fn(async (sql: string) => {
    if (sql.includes('COUNT(*)')) return { total: String(dbItems.movimientos.length) };
    if (sql.includes('caja_config')) return null;
    return null;
  }),
  getAll: jest.fn(async (sql: string) => {
    if (sql.includes('GROUP_CONCAT(cmn.prenota_id)')) return dbItems.movimientos;
    if (sql.includes('FROM caja_cierres')) return [];
    if (sql.includes('caja_saldos_iniciales')) return [];
    return [];
  }),
  execute: jest.fn(async () => {}),
  onChangeWithCallback: jest.fn((handler: any, _options: any) => {
    capturedOnChange = handler?.onChange ?? null;
    return jest.fn(); // dispose
  }),
};
jest.mock('@powersync/react', () => ({
  usePowerSync: () => dbMock,
}));
jest.mock('@/lib/powersync/PowerSyncProvider', () => ({
  PowerSyncProvider: ({ children }: any) => children,
}));

const TABLAS = ['caja_movimientos', 'caja_movimiento_notas', 'caja_saldos_iniciales', 'caja_cierres'];

function unMovimiento(monto: number) {
  return {
    id: 'mov-1', fecha: '2026-01-01', tipo: 'cobro', cliente_id: null, nombre_cliente: null,
    cuenta_id: 1, cuenta_nombre: 'Caja', moneda: 'USD', monto, monto_usd: monto,
    tipo_cambio: null, forma_pago: 'efectivo', observaciones: null, empresa: 'bazar-naty',
    es_credito: 0, notas_imputadas: '', usuario_id: null, usuario_nombre: 'T', created_at: '', updated_at: '',
  };
}

function renderPage() {
  return render(
    <CajaMayorClient dolarDia={0} cuentas={[]} userName="Test" userRol="admin" userId={1} />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  offlineFlag = true;
  dbItems.movimientos = [];
  capturedOnChange = null;
});

describe('Refresco reactivo Caja Mayor (onChangeWithCallback)', () => {
  it('R1: el efecto se suscribe con las 4 tablas locales', async () => {
    renderPage();
    await waitFor(() => expect(dbMock.onChangeWithCallback).toHaveBeenCalled());
    const options = dbMock.onChangeWithCallback.mock.calls[0][1] as any;
    expect(options.tables).toEqual(expect.arrayContaining(TABLAS));
  });

  it('R2: UPDATE local → el watcher refleja el cambio sin segunda invocación manual', async () => {
    dbItems.movimientos = [unMovimiento(5)];
    renderPage();

    // La tabla muestra el monto inicial tras el fetch de montaje.
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
    await waitFor(() => expect(capturedOnChange).not.toBeNull());

    // Un cambio local (edición offline) persiste otro monto en SQLite.
    dbItems.movimientos = [unMovimiento(7)];
    // El watcher se dispara SOLO por el handler (no se invoca fetch manual).
    capturedOnChange!();

    // La vista refleja el monto nuevo sin necesidad de otra llamada manual.
    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument());
    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });

  it('R3: el handler no genera loop (la lectura no re-dispara la suscripción)', async () => {
    dbItems.movimientos = [unMovimiento(5)];
    renderPage();
    await waitFor(() => expect(capturedOnChange).not.toBeNull());

    const callsBefore = (dbMock.onChangeWithCallback as jest.Mock).mock.calls.length;
    // Disparar el handler una vez → refetch (lectura), que NO debe re-suscribir.
    capturedOnChange!();
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());

    expect((dbMock.onChangeWithCallback as jest.Mock).mock.calls.length).toBe(callsBefore);
  });
});
