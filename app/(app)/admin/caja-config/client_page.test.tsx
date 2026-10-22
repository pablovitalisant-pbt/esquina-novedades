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

const OPCION = { codigo: 'delivery_iquique', nombre: 'Delivery Iquique', costo: 3000 };

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => ({
      data: url === '/api/caja/cuentas'
        ? [{ id: 3, nombre: 'Caja chica', moneda: 'USD', activa: true, orden: 1, created_at: null }, { id: 4, nombre: 'Caja MP', moneda: 'CLP', activa: true, orden: 2, created_at: null }]
        : url === '/api/entrega/opciones' ? [OPCION]
        : url === '/api/caja/config' ? { mp_cuenta_id: 3 } : [],
    }),
  }));
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

describe('app/(app)/admin/caja-config — carga por API y guard sin conexión', () => {
  it('carga con 4 fetch y muestra la cuenta activa sin moneda ni dólar', async () => {
    render(<CajaConfigClient currentUserNombre="Admin" />);
    await screen.findAllByText('Caja chica');
    expect(screen.getAllByText('Activa').length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(screen.queryByText(/USD|ARS|Moneda/)).toBeNull();
    expect(screen.queryByText('Valor USD a ARS')).toBeNull();
  });

  it('cuenta para cobros de Mercado Pago: preselecciona y hace PATCH al cambiar', async () => {
    render(<CajaConfigClient currentUserNombre="Admin" />);
    const select = (await screen.findByLabelText('Cuenta para cobros de Mercado Pago')) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('3'));
    fireEvent.change(select, { target: { value: '4' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/caja/config',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ mp_cuenta_id: 4 }) }),
    ));
  });

  it('admin de entregas: edita costo y hace PATCH a la opción', async () => {
    render(<CajaConfigClient currentUserNombre="Admin" />);
    await screen.findByText('Delivery Iquique');

    fireEvent.change(screen.getByLabelText('Costo de Delivery Iquique'), { target: { value: '5000' } });
    fireEvent.click(screen.getByLabelText('Guardar costo de Delivery Iquique'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/entrega/opciones/delivery_iquique',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ costo: 5000 }) }),
    ));
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
