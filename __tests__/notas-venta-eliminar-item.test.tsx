/**
 * @jest-environment jsdom
 *
 * eliminarItem (BUG-040): la única ruta es fetch(DELETE) + refetch online.
 * (Slice 3: se quitó la rama offline; pendiente renombrar a notas-venta-eliminar-item.)
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
jest.mock('xlsx', () => ({ utils: { json_to_sheet: jest.fn(), book_new: jest.fn(), book_append_sheet: jest.fn(), writeFile: jest.fn() } }));
jest.mock('jspdf-autotable', () => jest.fn());
jest.mock('@/components/PagarNotaDialog', () => ({ PagarNotaDialog: () => null }));

let items: any[];
const fetchMock = jest.fn(async (url: string, reqOpts?: RequestInit) => {
  const method = reqOpts?.method;
  if (url.includes('/items/') && method === 'DELETE') {
    items = items.filter(i => !url.endsWith(i.id));
    return { ok: true, json: async () => ({}) };
  }
  if (url.startsWith('/api/notas-venta/1') && !method) {
    return { ok: true, json: async () => ({ id: 1, titulo: 'Nota de Venta #1', cliente_nombre: null, items }) };
  }
  if (url === '/api/caja/config') return { ok: true, json: async () => ({ data: { valor: '0' } }) };
  return { ok: true, json: async () => ({}) };
});

// prenota_items.id es UUID string (migración 027): no convertir a Number (BUG-040/041).
describe('eliminarItem — online', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
    items = [
      { id: 'uuid-1', codigo: 'X-001', descripcion: 'Item X', cajas: 1, unidades: 2, precio: 10 },
      { id: 'uuid-2', codigo: 'Y-002', descripcion: 'Item Y', cajas: 1, unidades: 1, precio: 15 },
    ];
    global.fetch = fetchMock as any;
  });

  it('eliminar hace fetch(DELETE) con el UUID y el ítem desaparece de la UI', async () => {
    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);
    await waitFor(() => expect(screen.getByText('X-001')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: /editar/i })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /eliminar/i }));

    await waitFor(() => expect(screen.queryByText('X-001')).not.toBeInTheDocument());
    const deletes = fetchMock.mock.calls.filter(c => c[1]?.method === 'DELETE');
    expect(deletes.map(c => c[0])).toEqual(['/api/notas-venta/1/items/uuid-1']);
    expect(screen.getByText('Y-002')).toBeInTheDocument();
  });
});
