/**
 * @jest-environment jsdom
 *
 * Fase B — fix-prefetch-notas-venta.
 *
 * El loop ciego del mount (router.prefetch para TODAS las notas) costaba 53+
 * invocaciones de función + 53+ de middleware por visita a /notas-venta.
 * Se reemplaza por prefetch on-hover con debounce (~150ms) y dedupe por nota.
 *
 * Los 4 tests corren con el flag `notas-venta-prefetch-hover` en TRUE para
 * ejercitar el mecanismo nuevo: así el test de mount rompe contra el loop viejo.
 */

import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { PrenotasPage } from '@/app/(app)/notas-venta/client_page';

const push = jest.fn();
const prefetch = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, prefetch }),
  useParams: () => ({}),
}));
jest.mock('@powersync/react', () => ({
  usePowerSync: () => null,
  PowerSyncContext: { Provider: ({ children }: any) => children },
}));
jest.mock('@/lib/powersync/PowerSyncProvider', () => ({
  PowerSyncProvider: ({ children }: any) => children,
}));
jest.mock('@/config/feature-flags.json', () => ({
  get 'notas-venta-prefetch-hover'() {
    return (globalThis as any).__prefetchHover === true;
  },
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

// La lista ordena por created_at DESC → Nota B (62) primero, Nota A (61) después.
const notas = [
  { id: 61, titulo: 'Nota A', created_at: '2026-01-01T00:00:00Z', nombre_cliente: null, tipo_documento: null, total: 10, total_pagado: 0, saldo_pendiente: 10, estado: 'activa' },
  { id: 62, titulo: 'Nota B', created_at: '2026-01-02T00:00:00Z', nombre_cliente: null, tipo_documento: null, total: 20, total_pagado: 0, saldo_pendiente: 20, estado: 'activa' },
];

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).__prefetchHover = true;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: notas }) }) as any;
});

const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

async function renderLista() {
  render(<PrenotasPage session={{ user: { rol: 'admin' } }} />);
  await waitFor(() => expect(screen.getByText('Nota A')).toBeInTheDocument());
}

describe('notas-venta — prefetch on-hover', () => {
  test('montar la lista NO prefetchea ninguna nota (rompe el loop ciego)', async () => {
    await renderLista();
    await wait(250);
    expect(prefetch).not.toHaveBeenCalled();
  });

  test('hover corto (<150ms) NO prefetchea', async () => {
    await renderLista();
    const row = screen.getByTestId('nota-row-61');

    fireEvent.mouseEnter(row);
    await wait(80);
    fireEvent.mouseLeave(row);
    await wait(250);

    expect(prefetch).not.toHaveBeenCalled();
  });

  test('hover sostenido prefetchea 1 sola vez; repetirlo NO vuelve a prefetchear (dedupe)', async () => {
    await renderLista();
    const row = screen.getByTestId('nota-row-61');

    fireEvent.mouseEnter(row);
    await wait(250);
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith('/notas-venta/61');

    fireEvent.mouseLeave(row);
    fireEvent.mouseEnter(row);
    await wait(250);
    fireEvent.mouseLeave(row);

    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  test('flag en false (estado real de producción): hover sostenido NO prefetchea', async () => {
    (globalThis as any).__prefetchHover = false;
    await renderLista();
    const row = screen.getByTestId('nota-row-61');

    fireEvent.mouseEnter(row);
    await wait(250);
    fireEvent.mouseLeave(row);

    expect(prefetch).not.toHaveBeenCalled();
  });

  test('smoke: hover → Abrir navega al detalle de esa nota', async () => {
    await renderLista();
    const row = screen.getByTestId('nota-row-61');

    fireEvent.mouseEnter(row);
    await wait(250);
    fireEvent.click(within(row).getByText('Abrir'));

    expect(push).toHaveBeenCalledWith('/notas-venta/61');
  });
});
