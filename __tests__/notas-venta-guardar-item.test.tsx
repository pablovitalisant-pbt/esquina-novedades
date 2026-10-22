/**
 * @jest-environment jsdom
 *
 * handleGuardar: la única ruta es fetch(PATCH) al API.
 * (Slice 3: se quitó la rama offline; pendiente renombrar a notas-venta-guardar-item.)
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PrenotaDetallePage } from '@/app/(app)/notas-venta/[id]/client_page';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { rol: 'vendedor' } } }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({ id: '1' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/notas-venta/1',
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));
jest.mock('jspdf-autotable', () => jest.fn());
jest.mock('@/components/PagarNotaDialog', () => ({ PagarNotaDialog: () => null }));

const items = [
  { id: 'uuid-1', codigo: 'X-001', descripcion: 'Item X', cajas: 1, unidades: 2, precio: 10 },
  { id: 'uuid-2', codigo: 'Y-002', descripcion: 'Item Y', cajas: 1, unidades: 1, precio: 15 },
];
const fetchMock = jest.fn(async (url: string, reqOpts?: RequestInit) => {
  const method = reqOpts?.method;
  if (url.includes('/items/') && method === 'PATCH') return { ok: true, json: async () => ({ ok: true }) };
  if (url.startsWith('/api/notas-venta/1') && !method) {
    return { ok: true, json: async () => ({ id: 1, titulo: 'Nota de Venta #1', cliente_nombre: null, items }) };
  }
  if (url === '/api/caja/config') return { ok: true, json: async () => ({ data: { valor: '0' } }) };
  return { ok: true, json: async () => ({}) };
});

describe('handleGuardar — online', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as any;
  });

  it('guardar hace fetch(PATCH) con cajas/unidades/precio y cierra la edición', async () => {
    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);
    await waitFor(() => expect(screen.getByText('X-001')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: /editar/i })[0]);
    const precio = (await screen.findAllByRole('spinbutton')).find(i => (i as HTMLInputElement).value === '10')!;
    fireEvent.change(precio, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => {
      const patches = fetchMock.mock.calls.filter(c => c[1]?.method === 'PATCH');
      expect(patches).toHaveLength(1);
      expect(patches[0][0]).toBe('/api/notas-venta/1/items/uuid-1');
      expect(JSON.parse(patches[0][1]!.body as string)).toEqual({ cajas: 1, unidades: 2, precio: 12 });
    });
    await waitFor(() => expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument());
  });
});
