/**
 * @jest-environment jsdom
 */
import { render, waitFor } from '@testing-library/react';
import { CajaMayorClient } from './client_page';

var dbMock: any;

jest.mock('@powersync/react', () => ({
  usePowerSync: () => dbMock,
  PowerSyncContext: { Provider: ({ children }: any) => children },
}));
jest.mock('@/lib/powersync/PowerSyncProvider', () => ({
  PowerSyncProvider: ({ children }: any) => children,
}));
jest.mock('@/config/feature-flags.json', () => ({
  get 'caja-mayor-offline-lectura'() {
    return (globalThis as any).__cajaOffline === true;
  },
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('lucide-react', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/components/ui/button', () => ({ Button: ({ children }: any) => children }));
jest.mock('@/components/ui/input', () => ({ Input: (props: any) => require('react').createElement('input', props) }));
jest.mock('@/components/ui/badge', () => ({ Badge: ({ children }: any) => children }));
jest.mock('@/components/ui/dialog', () => {
  const R = require('react');
  return { Dialog: ({ children }: any) => R.createElement('div', null, children), DialogContent: ({ children }: any) => R.createElement('div', null, children), DialogHeader: ({ children }: any) => R.createElement('div', null, children), DialogTitle: ({ children }: any) => R.createElement('div', null, children), DialogFooter: ({ children }: any) => R.createElement('div', null, children) };
});

const fetchMock = jest.fn();
global.fetch = fetchMock as any;

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).__cajaOffline = false;
  dbMock = { getAll: jest.fn().mockResolvedValue([]), get: jest.fn().mockResolvedValue({ total: 0 }), onChangeWithCallback: jest.fn(() => jest.fn()) };
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }) });
});

const props = { dolarDia: 1000, cuentas: [], userName: 'Admin', userRol: 'admin', userId: 1 };

describe('app/(app)/caja-mayor — caja-mayor-offline-lectura (regresión)', () => {
  it('flag en false (default): usa fetch a /api/caja/movimientos, NO getAll local', async () => {
    render(<CajaMayorClient {...props} />);
    await waitFor(() => {
      const hit = fetchMock.mock.calls.some((c: any[]) => String(c[0]).includes('/api/caja/movimientos'));
      expect(hit).toBe(true);
    });
    expect(dbMock.getAll).not.toHaveBeenCalled();
  });

  it('flag en true: usa la query local vía getAll y NO llama a movimientos/resumen por fetch', async () => {
    (globalThis as any).__cajaOffline = true;
    render(<CajaMayorClient {...props} />);
    await waitFor(() => expect(dbMock.getAll).toHaveBeenCalled());
    const sql = dbMock.getAll.mock.calls[0][0] as string;
    expect(sql).toContain('FROM caja_movimientos m');
    expect(sql).toContain('JOIN caja_cuentas cc');
    const cajaFetches = fetchMock.mock.calls.filter((c: any[]) =>
      String(c[0]).includes('/api/caja/movimientos') || String(c[0]).includes('/api/caja/resumen-cuentas')
    );
    expect(cajaFetches.length).toBe(0);
  });
});
