/**
 * @jest-environment jsdom
 *
 * FASE B — BUG-054 (Parte 1 y Parte 3): editar/eliminar movimiento offline en
 * la UI + bloquear "cierre de caja" offline con mensaje claro.
 *
 * R3  handleEditDelete sin catch → una operación que falla debe avisar con
 *     toast.error, no fallar en silencio (test que fuerza el catch a dispararse).
 * R4  Botón "Cierre de Período" deshabilitado offline.
 * R4b Idem habilitado online.
 * R4c El estado online/offline se actualiza SIN recargar (listener de eventos).
 * Smoke: el cierre queda bloqueado offline (mismo gate que R4).
 *
 * La sincronización de editar/eliminar (Parte 2) la cubre
 * caja-mayor-sync-bug054.test.ts (capa connector).
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CajaMayorClient } from '@/app/(app)/caja-mayor/client_page';

let offlineFlag = true;
jest.mock('@/config/feature-flags.json', () => ({
  get 'caja-mayor-offline-lectura'() { return offlineFlag; },
}));

const toast = { success: jest.fn(), error: jest.fn(), warning: jest.fn() };
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

// DB local PowerSync (las consultas locales dependen del flag on).
const dbItems: any = { movimientos: [], executeReject: false };
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
  execute: jest.fn(async () => {
    if (dbItems.executeReject) throw new Error('no disk');
  }),
  onChangeWithCallback: jest.fn(() => jest.fn()),
};
jest.mock('@powersync/react', () => ({
  usePowerSync: () => dbMock,
}));
jest.mock('@/lib/powersync/PowerSyncProvider', () => ({
  PowerSyncProvider: ({ children }: any) => children,
}));

const toastModule = require('sonner').toast as typeof toast;

// Controles de navegador.
const fetchMock = jest.fn(async (url: string | URL, reqOpts?: RequestInit) => {
  // En modo offline las lecturas usan db; el fetch solo se toca en la rama
  // online (o en el red-state del DELETE). Devolver 200 por defecto.
  return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
});

function setOnline(v: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: v });
}

const UN_MOVIMIENTO = {
  id: 'mov-1', fecha: '2026-01-01', tipo: 'cobro', cliente_id: null, nombre_cliente: null,
  cuenta_id: 1, cuenta_nombre: 'Caja', moneda: 'USD', monto: 100, monto_usd: 100,
  tipo_cambio: null, forma_pago: 'efectivo', observaciones: null, empresa: 'bazar-naty',
  es_credito: 0, notas_imputadas: '', usuario_id: null, usuario_nombre: 'T', created_at: '', updated_at: '',
};

function renderPage() {
  return render(
    <CajaMayorClient dolarDia={0} cuentas={[]} userName="Test" userRol="admin" userId={1} />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  offlineFlag = true;
  dbItems.movimientos = [];
  dbItems.executeReject = false;
  global.fetch = fetchMock as any;
  setOnline(true);
});

describe('BUG-054 — cierre de caja bloqueado offline', () => {
  it('R4: botón "Cierre de Período" deshabilitado offline', async () => {
    setOnline(false);
    renderPage();
    const btn = await screen.findByRole('button', { name: /cierre de período/i });
    expect(btn).toBeDisabled();
  });

  it('R4b: habilitado online', async () => {
    setOnline(true);
    renderPage();
    const btn = await screen.findByRole('button', { name: /cierre de período/i });
    expect(btn).not.toBeDisabled();
  });

  it('R4c: el estado se actualiza sin recargar al disparar el evento offline', async () => {
    setOnline(true);
    renderPage();
    const btn = await screen.findByRole('button', { name: /cierre de período/i });
    expect(btn).not.toBeDisabled();

    setOnline(false);
    fireEvent(window, new Event('offline'));
    await waitFor(() => expect(btn).toBeDisabled());
  });
});

describe('BUG-054 — editar/eliminar movimiento offline: catch → toast.error', () => {
  it('R3: si la operación de eliminar falla (db.execute lanza) → toast.error, no falla en silencio', async () => {
    setOnline(true);
    dbItems.movimientos = [UN_MOVIMIENTO];
    dbItems.executeReject = true; // fuerza el catch en la rama offline

    renderPage();

    // Abrir el modal de edición con confirmación de borrado (botón "Eliminar" de la fila).
    const delBtn = await screen.findByTitle('Eliminar');
    fireEvent.click(delBtn);

    // Click en "⚠ Eliminar movimiento" (solo visible con editDeleteConfirm).
    const confirmBtn = await screen.findByRole('button', { name: /eliminar movimiento/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(toastModule.error).toHaveBeenCalled());
  });
});

describe('BUGFIX — edit offline recalcula monto_usd (tabla mostraba monto viejo)', () => {
  it('R7: editar el monto offline → el UPDATE incluye monto_usd y tipo_cambio recalculados', async () => {
    setOnline(true);
    dbItems.movimientos = [UN_MOVIMIENTO]; // USD, monto 100, monto_usd 100
    renderPage();

    // Abrir el modal de edición.
    const editBtn = await screen.findByTitle('Editar');
    fireEvent.click(editBtn);

    // Cambiar el monto de 100 → 150.
    const montoInput = await screen.findByDisplayValue('100');
    fireEvent.change(montoInput, { target: { value: '150' } });

    // Guardar (rama offline).
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(dbMock.execute).toHaveBeenCalled());

    const [sqlStr, params] = dbMock.execute.mock.calls[0];
    // El bug: el UPDATE offline no incluía monto_usd → el render prioriza
    // monto_usd (nunca null) y mostraba el valor viejo. El fix debe incluirlo.
    expect(String(sqlStr)).toContain('monto_usd = ?');
    expect(String(sqlStr)).toContain('tipo_cambio = ?');
    // USD → monto_usd = monto = 150, tipo_cambio = null.
    expect(params).toContain(150);
    expect(params).toContain(null);
  });
});
