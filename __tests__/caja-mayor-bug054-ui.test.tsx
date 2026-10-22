/**
 * @jest-environment jsdom
 *
 * BUG-054 (Parte 3): bloquear "cierre de caja" sin conexión con mensaje claro.
 *
 * R4  Botón "Cierre de Período" deshabilitado offline.
 * R4b Idem habilitado online.
 * R4c El estado online/offline se actualiza SIN recargar (listener de eventos).
 *
 * Slice 3: editar/eliminar offline (R3/R7) desaparecieron con la capa offline; las
 * mutaciones van siempre a la API.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CajaMayorClient } from '@/app/(app)/caja-mayor/client_page';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const fetchMock = jest.fn(async () => {
  return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
});

function setOnline(v: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: v });
}

function renderPage() {
  return render(
    <CajaMayorClient cuentas={[]} userName="Test" userRol="admin" userId={1} />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
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
