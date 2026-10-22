/**
 * @jest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AgregarANotaVentaModal } from '@/components/AgregarANotaVentaModal';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { rol: 'vendedor' } } }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/precios',
}));

const producto = {
  codigo: 'ABC123',
  detalle: 'Producto Test',
  imagen_url: null,
  empresa_id: 2,
  prcventa: 150,
  cantcaja: 6,
  saldo: 10,
};

describe('AgregarANotaVentaModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('smoke test — renderiza sin errores cuando open=true', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as any);

    const { container } = render(
      <AgregarANotaVentaModal
        open={true}
        onClose={jest.fn()}
        producto={producto}
      />
    );

    expect(container).toBeTruthy();
  });

  test('muestra lista de notas de venta', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 1, titulo: 'Nota de Venta #1' }] }),
    } as any);

    render(
      <AgregarANotaVentaModal
        open={true}
        onClose={jest.fn()}
        producto={producto}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Nota de Venta #1')).toBeInTheDocument();
    });
  });

  test('muestra campo de cajas y precio', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 1, titulo: 'Nota de Venta #1' }] }),
    } as any);

    render(
      <AgregarANotaVentaModal
        open={true}
        onClose={jest.fn()}
        producto={producto}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByRole('spinbutton').length).toBeGreaterThanOrEqual(2);
    });
  });

  test('click en Agregar llama al endpoint', async () => {
    global.fetch = jest.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/notas-venta' && (!options || options.method !== 'POST')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: [{ id: 1, titulo: 'Nota de Venta #1' }] }),
        });
      }

      if (url.includes('/items')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 55 }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    render(
      <AgregarANotaVentaModal
        open={true}
        onClose={jest.fn()}
        producto={producto}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Nota de Venta #1')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '1' } });
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '1' } });
    fireEvent.change(screen.getAllByRole('spinbutton')[1], { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/notas-venta/1/items',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  test('no renderiza nada cuando open=false', () => {
    global.fetch = jest.fn();

    const { container } = render(
      <AgregarANotaVentaModal
        open={false}
        onClose={jest.fn()}
        producto={producto}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  // ─── Test 5c: Texto renombrado ──────────────────────────────────────
  test('[TEXTO] el título del modal dice "Nota de Venta", no "Pre-Nota"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as any);

    render(
      <AgregarANotaVentaModal
        open={true}
        onClose={jest.fn()}
        producto={producto}
      />
    );

    await waitFor(() => {
      // El título del modal (<h2>) debe decir "Agregar a Nota de Venta"
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/nota de venta/i);
    });

    // No debe contener "Pre-Nota"
    expect(screen.queryByText(/pre-?nota/i)).not.toBeInTheDocument();
  });
});
