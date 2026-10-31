/**
 * @jest-environment jsdom
 *
 * Fase B — ProductDrawer: edicion del codigo de producto.
 *
 * El codigo se muestra fijo en el header. Este slice agrega modo edicion
 * (solo admin), llamada a POST /api/productos/[id]/cambiar-codigo y
 * presentacion del mensaje de error tal cual lo devuelve el servidor.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProductDrawer } from '@/components/ProductDrawer';
import { Producto, UserSession } from '@/types';
import { toast } from 'sonner';

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock('next/link', () => ({ children, href }: any) =>
  require('react').createElement('a', { href }, children)
);

const mockProducto: Producto = {
  id: 42, empresa_id: 1, codigo: 'PROD-01', detalle: 'Producto de prueba',
  prcventa: 100, prcminimo: 80, costo: 50, margen_pct: 25, cif: 40,
  saldo: 10, umed: 'U', cantcaja: 1, pesocaja: 1, cubicaja: 1,
  nroingreso: '2024-001', es_nuevo: false, categoria: null,
  imagen_url: null, fecha_ingreso: new Date(), updated_at: new Date(),
  stock_minimo: null as any,
};

const admin: UserSession = { id: '1', rut: '1-1', nombre: 'Admin', rol: 'admin', empresas: [1] };
const vendedor: UserSession = { id: '2', rut: '2-2', nombre: 'Vend', rol: 'vendedor', empresas: [1] };

const renderDrawer = (session: UserSession, onUpdated = jest.fn()) => {
  render(
    <ProductDrawer
      producto={mockProducto}
      session={session}
      open={true}
      onOpenChange={() => {}}
      onUpdated={onUpdated}
    />
  );
  return onUpdated;
};

/** Respuesta de fetch encadenada: la primera llamada (categorias) siempre ok. */
const mockFetch = (respuestaCambio: { ok: boolean; status: number; body: any }) => {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (String(url).includes('cambiar-codigo')) {
      return Promise.resolve({
        ok: respuestaCambio.ok,
        status: respuestaCambio.status,
        json: () => Promise.resolve(respuestaCambio.body),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
  });
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve([]) });
  global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  jest.clearAllMocks();
});

describe('ProductDrawer — editar codigo', () => {
  test('vendedor NO ve el boton de editar codigo', () => {
    renderDrawer(vendedor);
    expect(screen.getAllByText('PROD-01').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('editar-codigo-btn')).toBeNull();
  });

  test('admin ve el boton de editar codigo', () => {
    renderDrawer(admin);
    expect(screen.getByTestId('editar-codigo-btn')).toBeInTheDocument();
  });

  test('abrir edicion precarga el codigo actual en el input', () => {
    renderDrawer(admin);
    fireEvent.click(screen.getByTestId('editar-codigo-btn'));
    expect((screen.getByTestId('input-codigo') as HTMLInputElement).value).toBe('PROD-01');
  });

  test('guardar llama a POST /api/productos/42/cambiar-codigo con codigo_nuevo', async () => {
    mockFetch({ ok: true, status: 200, body: { data: { ...mockProducto, codigo: 'PROD-99' }, message: 'Código actualizado' } });
    const onUpdated = renderDrawer(admin);

    fireEvent.click(screen.getByTestId('editar-codigo-btn'));
    fireEvent.change(screen.getByTestId('input-codigo'), { target: { value: 'PROD-99' } });
    fireEvent.click(screen.getByTestId('guardar-codigo-btn'));

    await waitFor(() => {
      const call = (global.fetch as jest.Mock).mock.calls.find((c) => String(c[0]).includes('cambiar-codigo'));
      expect(call).toBeDefined();
      expect(call[0]).toBe('/api/productos/42/cambiar-codigo');
      expect(call[1].method).toBe('POST');
      expect(JSON.parse(call[1].body)).toEqual({ codigo_nuevo: 'PROD-99' });
    });
  });

  test('al exito refresca el producto en pantalla con el codigo nuevo', async () => {
    const actualizado = { ...mockProducto, codigo: 'PROD-99' };
    mockFetch({ ok: true, status: 200, body: { data: actualizado, message: 'Código actualizado' } });
    const onUpdated = renderDrawer(admin);

    fireEvent.click(screen.getByTestId('editar-codigo-btn'));
    fireEvent.change(screen.getByTestId('input-codigo'), { target: { value: 'PROD-99' } });
    fireEvent.click(screen.getByTestId('guardar-codigo-btn'));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(actualizado));
  });

  test('409 muestra el mensaje del servidor tal cual, no un texto generico', async () => {
    const mensaje = "Ya existe un producto con el código 'PROD-99' en esta empresa";
    mockFetch({ ok: false, status: 409, body: { error: mensaje } });
    renderDrawer(admin);

    fireEvent.click(screen.getByTestId('editar-codigo-btn'));
    fireEvent.change(screen.getByTestId('input-codigo'), { target: { value: 'PROD-99' } });
    fireEvent.click(screen.getByTestId('guardar-codigo-btn'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(mensaje));
  });

  test('400 "igual al actual" tambien se muestra tal cual', async () => {
    const mensaje = 'El código nuevo es igual al actual';
    mockFetch({ ok: false, status: 400, body: { error: mensaje } });
    renderDrawer(admin);

    fireEvent.click(screen.getByTestId('editar-codigo-btn'));
    fireEvent.click(screen.getByTestId('guardar-codigo-btn'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(mensaje));
  });

  test('no cierra el modo edicion si el guardado falla', async () => {
    mockFetch({ ok: false, status: 409, body: { error: 'Ya existe' } });
    renderDrawer(admin);

    fireEvent.click(screen.getByTestId('editar-codigo-btn'));
    fireEvent.change(screen.getByTestId('input-codigo'), { target: { value: 'PROD-99' } });
    fireEvent.click(screen.getByTestId('guardar-codigo-btn'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByTestId('input-codigo')).toBeInTheDocument();
  });

  test('cancelar cierra el modo edicion sin llamar al endpoint', () => {
    renderDrawer(admin);
    fireEvent.click(screen.getByTestId('editar-codigo-btn'));
    fireEvent.click(screen.getByTestId('cancelar-codigo-btn'));

    expect(screen.queryByTestId('input-codigo')).toBeNull();
    expect(screen.getAllByText('PROD-01').length).toBeGreaterThan(0);
    expect((global.fetch as jest.Mock).mock.calls.some((c) => String(c[0]).includes('cambiar-codigo'))).toBe(false);
  });
});
