/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PrenotasPage } from './client_page';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/components/PagarNotaDialog', () => ({ PagarNotaDialog: () => null }));

const fetchMock = jest.fn();
global.fetch = fetchMock as any;
const session = { user: { id: '1', rol: 'admin' } };

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
});

describe('app/(app)/notas-venta — lista por fetch', () => {
  it('carga la lista con GET /api/notas-venta (sin filtro por usuario)', async () => {
    render(<PrenotasPage session={session} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/notas-venta'));
  });

  it('flag notas-venta-por-dia apagado: lista idéntica, sin separadores de día', async () => {
    const notas = [
      { id: 1, titulo: 'Nota #1', created_at: '2026-11-20T02:30:00.000Z', total: 1000, total_pagado: 0, saldo_pendiente: 1000, estado: 'activa' },
      { id: 2, titulo: 'Nota #2', created_at: '2026-11-19T15:00:00.000Z', total: 2000, total_pagado: 0, saldo_pendiente: 2000, estado: 'activa' },
    ];
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: notas }) });

    const { container } = render(<PrenotasPage session={session} />);
    await screen.findByText('Nota #1');

    expect(screen.queryByTestId(/^dia-/)).toBeNull();
    expect(container.querySelector('h2')).toBeNull();
    // Mismas filas y mismo orden que hoy (created_at desc).
    const filas = Array.from(container.querySelectorAll('[data-testid^="nota-row-"]')).map((el) => el.getAttribute('data-testid'));
    expect(filas).toEqual(['nota-row-1', 'nota-row-2']);
  });

  it('anular usa DELETE /api/notas-venta/:id', async () => {
    const nota = { id: 40, titulo: 'Nota #1', created_at: '2026-08-01', total: 100, total_pagado: 0, saldo_pendiente: 100, estado: 'activa' };
    fetchMock.mockImplementation(async (url: string, init?: any) =>
      init?.method === 'DELETE' ? { ok: true, status: 200, json: async () => ({}) } : { ok: true, json: async () => ({ data: [nota] }) });
    global.confirm = jest.fn(() => true) as any;

    render(<PrenotasPage session={session} />);
    await screen.findByText('Nota #1');
    fireEvent.click(screen.getByText('Anular'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/notas-venta/40', { method: 'DELETE' }));
  });
});
