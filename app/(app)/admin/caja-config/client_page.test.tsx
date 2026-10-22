/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CajaConfigClient } from './client_page';

var dbMock: any;

jest.mock('@powersync/react', () => ({
  usePowerSync: () => dbMock,
  PowerSyncContext: { Provider: ({ children }: any) => children },
}));
jest.mock('@/lib/powersync/PowerSyncProvider', () => ({
  PowerSyncProvider: ({ children }: any) => children,
}));
jest.mock('@/config/feature-flags.json', () => ({
  get 'caja-config-offline-lectura'() {
    return (globalThis as any).__cajaConfigOffline === true;
  },
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('lucide-react', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/components/ui/button', () => ({ Button: ({ children, ...p }: any) => require('react').createElement('button', p, children) }));
jest.mock('@/components/ui/badge', () => ({ Badge: ({ children }: any) => children }));
jest.mock('@/components/ui/input', () => ({ Input: (props: any) => require('react').createElement('input', props) }));
jest.mock('@/components/ui/table', () => {
  const R = require('react');
  return { Table: ({ children }: any) => R.createElement('table', null, children), TableBody: ({ children }: any) => R.createElement('tbody', null, children), TableCell: ({ children }: any) => R.createElement('td', null, children), TableHead: ({ children }: any) => R.createElement('th', null, children), TableHeader: ({ children }: any) => R.createElement('thead', null, children), TableRow: ({ children }: any) => R.createElement('tr', null, children) };
});
jest.mock('@/components/ui/dialog', () => {
  const R = require('react');
  return { Dialog: ({ children }: any) => R.createElement('div', null, children), DialogContent: ({ children }: any) => R.createElement('div', null, children), DialogHeader: ({ children }: any) => R.createElement('div', null, children), DialogTitle: ({ children }: any) => R.createElement('div', null, children), DialogFooter: ({ children }: any) => R.createElement('div', null, children) };
});
jest.mock('@/docs/specs/caja-mayor.spec', () => ({ formatMonto: (v: number, m: string) => `${v}${m}` }));

const fetchMock = jest.fn();
global.fetch = fetchMock as any;

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).__cajaConfigOffline = false;
  dbMock = { get: jest.fn(), getAll: jest.fn(), execute: jest.fn().mockResolvedValue(undefined) };
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

describe('app/(app)/admin/caja-config — caja-config-offline-lectura (regresión)', () => {
  it('flag en true: carga local mapea activa a boolean (no 0/1)', async () => {
    (globalThis as any).__cajaConfigOffline = true;
    dbMock.get.mockResolvedValue({ valor: '980', updated_at: null, updated_por: '' });
    dbMock.getAll.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FROM caja_cuentas')) return [{ id: '3', nombre: 'Caja chica', moneda: 'USD', activa: '1', orden: 1, created_at: null }];
      return [];
    });
    render(<CajaConfigClient currentUserNombre="Admin" />);
    // la cuenta se renderiza con activa = !!Number('1') = true → "Activa"
    await screen.findByText('Caja chica');
    // toggle: activa true → la cuenta se muestra activa
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flag en true + offline: crear cuenta nueva muestra mensaje claro y NO hace fetch ni db.execute', async () => {
    (globalThis as any).__cajaConfigOffline = true;
    dbMock.getAll.mockResolvedValue([]);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    render(<CajaConfigClient currentUserNombre="Admin" />);

    fireEvent.click(screen.getAllByText('Nueva cuenta')[0]); // botón header
    const nombre = await screen.findByPlaceholderText('Ej: Caja chica');
    fireEvent.change(nombre, { target: { value: 'Caja test' } });
    fireEvent.click(screen.getByText('Crear cuenta'));

    await waitFor(() => expect(require('sonner').toast.error).toHaveBeenCalled());
    const msg = (require('sonner').toast.error as jest.Mock).mock.calls[0][0] as string;
    expect(msg).toContain('Crear una cuenta nueva requiere conexión');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dbMock.execute).not.toHaveBeenCalled();
  });
});
