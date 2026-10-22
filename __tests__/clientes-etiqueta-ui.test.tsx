/**
 * @jest-environment jsdom
 *
 * Fase B — Slice 6b: badge y filtro de etiqueta en /clientes (flag clientes-etiqueta).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ClientesPage } from '@/app/(app)/clientes/client_page';
jest.mock('@/config/feature-flags.json', () => ({ 'clientes-etiqueta': true }));
const flags = (): Record<string, boolean> => require('@/config/feature-flags.json');
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('lucide-react', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/components/ui/badge', () => ({ Badge: ({ children, ...p }: any) => React.createElement('span', p, children) }));
const fetchMock = jest.fn();
(global as any).fetch = fetchMock;
const clientes = [
  { id: 'c1', nombre: 'Juana', telefono: null, direccion: null, notas: null, created_at: '', saldo_favor: 0, etiqueta: 'mayorista' },
  { id: 'c2', nombre: 'Pedro', telefono: null, direccion: null, notas: null, created_at: '', saldo_favor: 0, etiqueta: null },
];
beforeEach(() => {
  jest.clearAllMocks();
  flags()['clientes-etiqueta'] = true;
  fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ data: clientes }) }));
});
describe('clientes — etiqueta', () => {
  test('badge solo donde hay etiqueta', async () => {
    render(<ClientesPage />);
    await screen.findByText('Pedro');
    const badges = screen.getAllByTestId('etiqueta-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('Mayorista');
  });
  test('filtro agrega etiqueta a la URL de fetch', async () => {
    render(<ClientesPage />);
    fireEvent.change(await screen.findByLabelText(/etiqueta/i), { target: { value: 'mayorista' } });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c: any[]) => String(c[0]).includes('etiqueta=mayorista'))).toBe(true)
    );
  });
  test('flag off => sin badge ni select', async () => {
    flags()['clientes-etiqueta'] = false;
    render(<ClientesPage />);
    await screen.findByText('Juana');
    expect(screen.queryByTestId('etiqueta-badge')).toBeNull();
    expect(screen.queryByLabelText(/etiqueta/i)).toBeNull();
  });
});
