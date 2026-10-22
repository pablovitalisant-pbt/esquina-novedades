/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CajaConfigClient } from './client_page';

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
jest.mock('@/docs/specs/caja-mayor.spec', () => ({ formatMonto: (v: number) => `${v}` }));

const fetchMock = jest.fn();
global.fetch = fetchMock as any;

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => ({
      data: url === '/api/caja/cuentas'
        ? [{ id: 3, nombre: 'Caja chica', moneda: 'USD', activa: true, orden: 1, created_at: null }]
        : [],
    }),
  }));
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

describe('app/(app)/admin/caja-config — carga por API y guard sin conexión', () => {
  it('carga con 2 fetch (sin /api/caja/config) y muestra la cuenta activa sin moneda ni dólar', async () => {
    render(<CajaConfigClient currentUserNombre="Admin" />);
    await screen.findAllByText('Caja chica');
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some((c: any[]) => c[0] === '/api/caja/config')).toBe(false);
    expect(screen.queryByText(/USD|ARS|Moneda/)).toBeNull();
    expect(screen.queryByText('Valor USD a ARS')).toBeNull();
  });

  it('sin conexión: crear cuenta nueva muestra mensaje claro y NO hace POST', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    render(<CajaConfigClient currentUserNombre="Admin" />);

    fireEvent.click(screen.getAllByText('Nueva cuenta')[0]); // botón header
    const nombre = await screen.findByPlaceholderText('Ej: Caja chica');
    fireEvent.change(nombre, { target: { value: 'Caja test' } });
    fireEvent.click(screen.getByText('Crear cuenta'));

    await waitFor(() => expect(require('sonner').toast.error).toHaveBeenCalled());
    const msg = (require('sonner').toast.error as jest.Mock).mock.calls[0][0] as string;
    expect(msg).toContain('Crear una cuenta nueva requiere conexión');
    expect(fetchMock.mock.calls.some((c: any[]) => c[1]?.method === 'POST')).toBe(false);
  });
});
