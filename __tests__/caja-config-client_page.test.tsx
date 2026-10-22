/**
 * Config de caja tras Slice 2e (CLP): sin bloque "Dólar del día", sin moneda,
 * sin llamadas a /api/caja/config y sin console.error en el render.
 */

import { render, screen } from '@testing-library/react';
import { CajaConfigClient } from '@/app/(app)/admin/caja-config/client_page';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

jest.mock('lucide-react', () => ({
  Pencil: () => <span data-testid="icon-pencil" />,
  Plus: () => <span data-testid="icon-plus" />,
  Loader2: () => <span data-testid="icon-loader" />,
  Trash2: () => <span data-testid="icon-trash" />,
}));

const fetchMock = jest.fn((url: string) => {
  if (url === '/api/caja/cuentas') {
    return Promise.resolve({ ok: true, json: async () => ({ data: [{ id: 1, nombre: 'Caja chica', activa: true, orden: 1, created_at: '2026-01-01' }] }) });
  }
  return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
});
global.fetch = fetchMock as any;

describe('CajaConfigClient — CLP', () => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    fetchMock.mockClear();
    consoleErrorSpy.mockClear();
  });

  afterAll(() => consoleErrorSpy.mockRestore());

  test('no muestra bloque dólar ni columna moneda', async () => {
    render(<CajaConfigClient currentUserNombre="Admin" />);
    await screen.findByText('Caja chica');
    expect(screen.queryByText(/dólar/i)).toBeNull();
    expect(screen.queryByText(/USD|ARS|Moneda/)).toBeNull();
  });

  test('no consulta /api/caja/config', async () => {
    render(<CajaConfigClient currentUserNombre="Admin" />);
    await screen.findByText('Caja chica');
    expect(fetchMock.mock.calls.some(c => c[0] === '/api/caja/config')).toBe(false);
  });

  test('sin console.error durante el render', async () => {
    render(<CajaConfigClient currentUserNombre="Admin" />);
    await screen.findByText('Caja chica');
    const errors = consoleErrorSpy.mock.calls.filter(c => typeof c[0] === 'string' && c[0].includes('Error'));
    expect(errors).toHaveLength(0);
  });
});
