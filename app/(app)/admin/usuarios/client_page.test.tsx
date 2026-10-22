/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UsuariosClient } from './client_page';

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

const USUARIO = { id: 5, rut: '1', nombre: 'Admin', rol: 'admin', activo: true, created_at: '2026-08-01', empresas: [1] };

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [USUARIO] }) });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

const delCalls = () => fetchMock.mock.calls.filter((c: any[]) => String(c[0]).includes('/api/admin/usuarios/') && c[1]?.method === 'DELETE');

describe('app/(app)/admin/usuarios — carga por fetch', () => {
  it('carga con fetch a /api/admin/usuarios exactamente 1 vez y marca "Tú"', async () => {
    render(<UsuariosClient currentUserId={5} />);
    await screen.findByText(/Admin \(Tú\)/);
    const api = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/admin/usuarios');
    expect(api.length).toBe(1);
  });

  it('sin conexión: eliminar muestra mensaje claro y NO hace fetch DELETE', async () => {
    global.confirm = jest.fn(() => true) as any;
    render(<UsuariosClient currentUserId={1} />); // 1 !== 5 → botón eliminar visible
    await screen.findByText('Admin');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    fireEvent.click(screen.getByLabelText('Eliminar Admin'));

    await waitFor(() => expect(require('sonner').toast.error).toHaveBeenCalled());
    const msg = (require('sonner').toast.error as jest.Mock).mock.calls[0][0] as string;
    expect(msg).toContain('requiere conexión a internet');
    expect(delCalls().length).toBe(0);
  });

  it('falso positivo de navigator.onLine: DELETE falla con TypeError → mensaje claro', async () => {
    global.confirm = jest.fn(() => true) as any;
    render(<UsuariosClient currentUserId={1} />);
    await screen.findByText('Admin');
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    fireEvent.click(screen.getByLabelText('Eliminar Admin'));

    await waitFor(() => expect(require('sonner').toast.error).toHaveBeenCalled());
    const msg = (require('sonner').toast.error as jest.Mock).mock.calls[0][0] as string;
    expect(msg).toContain('requiere conexión a internet');
  });
});
