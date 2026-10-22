/**
 * @jest-environment jsdom
 *
 * FASE B — Refresco reactivo de Categorías (mismo patrón que BUG-055/056 en
 * Caja Mayor). La lista arranca de initialCategorias (prop server) y las
 * mutaciones actualizan estado React de forma optimista, pero NO hay refetch:
 * cuando una categoría se crea offline y sincroniza al reconectar, el estado
 * no se reconcilia con la tabla local → desaparece hasta refrescar manual.
 *
 * R1  El efecto se suscribe a onChangeWithCallback con las tablas categorias y
 *     productos (productos porque total_productos depende de productos.categoria).
 * R2  Un cambio (sync en background) dispara fetchCategorias y la UI refleja la
 *     categoría local sin necesidad de refresh manual.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { CategoriasClient } from '@/app/(app)/admin/categorias/client_page';

let offlineFlag = true;
jest.mock('@/config/feature-flags.json', () => ({
  get 'categorias-offline-lectura'() { return offlineFlag; },
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const dbItems: any = { categorias: [] };
let capturedOnChange: (() => void) | null = null;
const dbMock = {
  getAll: jest.fn(async (sql: string) => {
    if (sql.includes('FROM categorias c')) return dbItems.categorias;
    return [];
  }),
  get: jest.fn(async () => null),
  execute: jest.fn(async () => {}),
  onChangeWithCallback: jest.fn((handler: any, _opts: any) => {
    capturedOnChange = handler?.onChange ?? null;
    return jest.fn(); // dispose
  }),
};
jest.mock('@powersync/react', () => ({ usePowerSync: () => dbMock }));
jest.mock('@/lib/powersync/PowerSyncProvider', () => ({
  PowerSyncProvider: ({ children }: any) => children,
}));

function renderPage() {
  return render(<CategoriasClient categorias={[]} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  offlineFlag = true;
  dbItems.categorias = [];
  capturedOnChange = null;
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) })) as any;
});

describe('Refresco reactivo Categorías (onChangeWithCallback)', () => {
  it('R1: el efecto se suscribe al watcher con las tablas categorias y productos', async () => {
    renderPage();
    await waitFor(() => expect(dbMock.onChangeWithCallback).toHaveBeenCalled());
    const opts = dbMock.onChangeWithCallback.mock.calls[0][1] as any;
    expect(opts.tables).toEqual(expect.arrayContaining(['categorias', 'productos']));
  });

  it('R2: un cambio (sync) dispara fetchCategorias y la UI refleja la categoría local', async () => {
    renderPage();
    await waitFor(() => expect(capturedOnChange).not.toBeNull());

    // Simular que la sincronización bajó una categoría a la tabla local.
    dbItems.categorias = [{ id: 'cat-1', nombre: 'Categoria A', created_at: '2026-08-01' }];
    capturedOnChange!();

    // La UI la muestra sin necesidad de refresh manual (aparece en la card de
    // categoría y en el <option> del select de filtro).
    await waitFor(() => expect(screen.getAllByText('Categoria A').length).toBeGreaterThan(0));
  });
});
