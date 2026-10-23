/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PreciosClient } from './client_page';

jest.mock('@/config/feature-flags.json', () => ({}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/components/ProductCard', () => ({ ProductCard: () => null }));
jest.mock('@/components/ProductDrawer', () => ({ ProductDrawer: () => null }));

const fetchMock = jest.fn();
global.fetch = fetchMock as any;

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
});

async function typeSearch(term: string) {
  render(<PreciosClient session={{ rol: 'admin', user: { id: '1', rol: 'admin' } } as any} />);
  const input = await screen.findByPlaceholderText('Buscar por código o descripción...');
  fireEvent.change(input, { target: { value: term } });
}

describe('app/(app)/precios — carga por API', () => {
  it('busca en /api/productos y ya no consulta /api/caja/config', async () => {
    await typeSearch('GL8');
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/productos?search=GL8'))).toBe(true);
    }, { timeout: 2000 });
    expect(fetchMock.mock.calls.some(call => call[0] === '/api/caja/config')).toBe(false);
  });
});
