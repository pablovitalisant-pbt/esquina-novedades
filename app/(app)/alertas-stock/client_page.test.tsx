/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AlertasStockClient } from './client_page';

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
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [ALERTA] }) });
});

describe('app/(app)/alertas-stock — carga y acciones por fetch', () => {
  it('carga con fetch a /api/alertas-stock/lista exactamente 1 vez y pinta el dato', async () => {
    render(<AlertasStockClient />);
    await screen.findByText('Prod A');
    const lista = fetchMock.mock.calls.filter((c: any[]) => c[0] === '/api/alertas-stock/lista');
    expect(lista.length).toBe(1);
  });

  it('"Ignorar" hace PUT /api/alertas-stock/5 con accion ignorar', async () => {
    render(<AlertasStockClient />);
    await screen.findByText('Prod A');
    fireEvent.click(screen.getByText('Ignorar'));
    await waitFor(() => {
      const put = fetchMock.mock.calls.find((c: any[]) => c[0] === '/api/alertas-stock/5' && c[1]?.method === 'PUT');
      expect(put).toBeTruthy();
      expect(JSON.parse(put![1].body)).toEqual({ accion: 'ignorar' });
    });
  });
});
