/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AlertasStockClient } from './client_page';

var dbMock: any;

jest.mock('@powersync/react', () => ({
  usePowerSync: () => dbMock,
  PowerSyncContext: { Provider: ({ children }: any) => children },
}));
jest.mock('@/lib/powersync/PowerSyncProvider', () => ({
  PowerSyncProvider: ({ children }: any) => children,
}));
jest.mock('@/config/feature-flags.json', () => ({
  get 'alertas-stock-offline-lectura'() {
    return (globalThis as any).__alertasOffline === true;
  },
}));
jest.mock('@/contexts/AlertasContext', () => ({
  useAlertas: () => ({ refreshStockBajo: jest.fn() }),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('lucide-react', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/components/ui/button', () => ({ Button: ({ children, ...p }: any) => require('react').createElement('button', p, children) }));
jest.mock('@/components/ui/badge', () => ({ Badge: ({ children }: any) => children }));
jest.mock('@/components/ImageWithFallback', () => ({ ImageWithFallback: () => null }));

const fetchMock = jest.fn();
global.fetch = fetchMock as any;

const ALERTA = { producto_id: 5, codigo: 'A-001', detalle: 'Prod A', imagen_url: null, saldo: 2, stock_minimo: 5, deficit: 3 };

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).__alertasOffline = false;
  dbMock = { getAll: jest.fn().mockResolvedValue([]), execute: jest.fn().mockResolvedValue(undefined) };
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
});

describe('app/(app)/alertas-stock — alertas-stock-offline-lectura (regresión)', () => {
  it('flag en false: usa fetch a /api/alertas-stock/lista', async () => {
    render(<AlertasStockClient />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(dbMock.getAll).not.toHaveBeenCalled();
  });

  it('flag en true: fetchAlertas usa la query local (NO fetch)', async () => {
    (globalThis as any).__alertasOffline = true;
    dbMock.getAll.mockResolvedValue([ALERTA]);
    render(<AlertasStockClient />);
    await screen.findByText('Prod A');
    expect(dbMock.getAll).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flag en true: "Ignorar" usa db.execute(INSERT alertas_stock_bajo), NO fetch PUT', async () => {
    (globalThis as any).__alertasOffline = true;
    dbMock.getAll.mockResolvedValue([ALERTA]);
    render(<AlertasStockClient />);
    await screen.findByText('Prod A');
    fireEvent.click(screen.getByText('Ignorar'));
    await waitFor(() => expect(dbMock.execute).toHaveBeenCalled());
    const sql = dbMock.execute.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO alertas_stock_bajo');
    const del = fetchMock.mock.calls.filter((c: any[]) => String(c[0]).includes('/api/alertas-stock/') && c[1]?.method === 'PUT');
    expect(del.length).toBe(0);
  });
});
