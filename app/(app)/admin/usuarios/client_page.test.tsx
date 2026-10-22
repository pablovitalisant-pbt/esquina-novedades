/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UsuariosClient } from './client_page';

var dbMock: any;

jest.mock('@powersync/react', () => ({
  usePowerSync: () => dbMock,
  PowerSyncContext: { Provider: ({ children }: any) => children },
}));
jest.mock('@/lib/powersync/PowerSyncProvider', () => ({
  PowerSyncProvider: ({ children }: any) => children,
}));
jest.mock('@/config/feature-flags.json', () => ({
  get 'usuarios-offline-lectura'() {
    return (globalThis as any).__usuariosOffline === true;
  },
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('lucide-react', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/components/ui/button', () => ({ Button: ({ children, ...p }: any) => require('react').createElement('button', p, children) }));
jest.mock('@/components/ui/badge', () => ({ Badge: ({ children }: any) => children }));
jest.mock('@/components/ui/table', () => {
  const R = require('react');
  return { Table: ({ children }: any) => R.createElement('table', null, children), TableBody: ({ children }: any) => R.createElement('tbody', null, children), TableCell: ({ children }: any) => R.createElement('td', null, children), TableHead: ({ children }: any) => R.createElement('th', null, children), TableHeader: ({ children }: any) => R.createElement('thead', null, children), TableRow: ({ children }: any) => R.createElement('tr', null, children) };
});
jest.mock('@/components/ui/dialog', () => {
  const R = require('react');
  return { Dialog: ({ children }: any) => R.createElement('div', null, children), DialogContent: ({ children }: any) => R.createElement('div', null, children), DialogHeader: ({ children }: any) => R.createElement('div', null, children), DialogTitle: ({ children }: any) => R.createElement('div', null, children), DialogFooter: ({ children }: any) => R.createElement('div', null, children) };
});
jest.mock('@/components/ui/input', () => ({ Input: (props: any) => require('react').createElement('input', props) }));

const fetchMock = jest.fn();
global.fetch = fetchMock as any;

const USUARIO = { id: '5', rut: '1', nombre: 'Admin', rol: 'admin', activo: true, created_at: '2026-08-01' };

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).__usuariosOffline = false;
  dbMock = { getAll: jest.fn().mockResolvedValue([]) };
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

describe('app/(app)/admin/usuarios — usuarios-offline-lectura (regresión)', () => {
  it('flag en true: fetchUsuarios local mapea id a Number (badge "Tú" funciona)', async () => {
    (globalThis as any).__usuariosOffline = true;
    dbMock.getAll.mockResolvedValue([USUARIO]);
    render(<UsuariosClient currentUserId={5} />); // id 5 == user id 5 (mapped)
    // si id no se mapeara a Number, currentUserId (5) !== '5' → sin " (Tú)"
    await screen.findByText(/Admin \(Tú\)/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flag en true + offline: eliminar muestra mensaje claro y NO hace fetch', async () => {
    (globalThis as any).__usuariosOffline = true;
    dbMock.getAll.mockResolvedValue([USUARIO]);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    global.confirm = jest.fn(() => true) as any;

    render(<UsuariosClient currentUserId={1} />); // 1 !== 5 → botón eliminar visible
    await screen.findByText('Admin');
    fireEvent.click(screen.getByLabelText('Eliminar Admin'));

    await waitFor(() => expect(require('sonner').toast.error).toHaveBeenCalled());
    const msg = (require('sonner').toast.error as jest.Mock).mock.calls[0][0] as string;
    expect(msg).toContain('requiere conexión a internet');
    // no intentó el DELETE
    const del = fetchMock.mock.calls.filter((c: any[]) => String(c[0]).includes('/api/admin/usuarios/') && c[1]?.method === 'DELETE');
    expect(del.length).toBe(0);
  });

  it('falso positivo de navigator.onLine: fetch falla con TypeError → mensaje claro', async () => {
    (globalThis as any).__usuariosOffline = true;
    dbMock.getAll.mockResolvedValue([USUARIO]);
    // onLine true pero fetch falla con TypeError (red sin salida real)
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    render(<UsuariosClient currentUserId={1} />);
    await screen.findByText('Admin');
    fireEvent.click(screen.getByLabelText('Eliminar Admin'));

    await waitFor(() => expect(require('sonner').toast.error).toHaveBeenCalled());
    const msg = (require('sonner').toast.error as jest.Mock).mock.calls[0][0] as string;
    expect(msg).toContain('requiere conexión a internet');
  });
});

describe('BUG — fetchUsuarios fallback online cuando la tabla local está vacía', () => {
  it('R1: flag true + sync local vacío + online → cae a la API y muestra los datos', async () => {
    (globalThis as any).__usuariosOffline = true;
    dbMock.getAll.mockResolvedValue([]); // tabla local vacía (sync roto o aún no bajó)
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [USUARIO] }) });

    render(<UsuariosClient currentUserId={1} />);
    await screen.findByText('Admin');

    // pegó a la API (fallback) en vez de mostrar una lista en blanco
    const api = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/admin/usuarios');
    expect(api.length).toBeGreaterThan(0);
  });

  it('R2: flag true + sync con datos → usa local, no pega a la API', async () => {
    (globalThis as any).__usuariosOffline = true;
    dbMock.getAll.mockResolvedValue([USUARIO]);

    render(<UsuariosClient currentUserId={1} />);
    await screen.findByText('Admin');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
