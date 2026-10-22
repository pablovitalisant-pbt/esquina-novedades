/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PreciosClient } from './client_page';

var dbMock: any;

jest.mock('@powersync/react', () => ({
  usePowerSync: () => dbMock,
  PowerSyncContext: { Provider: ({ children }: any) => children },
}));
jest.mock('@/lib/powersync/PowerSyncProvider', () => ({
  PowerSyncProvider: ({ children }: any) => children,
}));
jest.mock('@/config/feature-flags.json', () => ({
  get 'precios-offline-lectura'() {
    return (globalThis as any).__preciosOffline === true;
  },
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/components/ProductCard', () => ({ ProductCard: () => null }));
jest.mock('@/components/ProductDrawer', () => ({ ProductDrawer: () => null }));

const fetchMock = jest.fn();
global.fetch = fetchMock as any;

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).__preciosOffline = false;
  dbMock = { getAll: jest.fn().mockResolvedValue([]) };
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
});

async function typeSearch(term: string) {
  render(<PreciosClient session={{ rol: 'admin', user: { id: '1', rol: 'admin' } }} />);
  const input = await screen.findByPlaceholderText('Buscar por código o descripción...');
  fireEvent.change(input, { target: { value: term } });
}

describe('app/(app)/precios — precios-offline-lectura (regresión)', () => {
  it('flag en false (default): usa fetch a /api/productos, NO getAll local', async () => {
    await typeSearch('GL8');
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/productos'))).toBe(true);
    }, { timeout: 2000 });
    expect(dbMock.getAll).not.toHaveBeenCalled();
  });

  it('flag en true: usa la query local vía getAll (GROUP BY) y NO fetch', async () => {
    (globalThis as any).__preciosOffline = true;
    await typeSearch('GL8');
    await waitFor(() => expect(dbMock.getAll).toHaveBeenCalled(), { timeout: 2000 });
    const sql = dbMock.getAll.mock.calls[0][0] as string;
    expect(sql).toContain('GROUP BY p.codigo');
    expect(sql).toContain('HAVING (? = 0 OR SUM(p.saldo) > 0)');
    expect(sql).toContain('MAX(p.es_nuevo) = 1'); // BOOL_OR no existe en SQLite
    expect(sql).toContain('FROM productos p');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
