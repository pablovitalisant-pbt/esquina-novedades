/**
 * @jest-environment jsdom
 *
 * Fase B — ProductDrawer: eliminar producto (soft-delete).
 *
 * El modal exige escribir el codigo exacto (case-sensitive, trim) para
 * habilitar la confirmacion. El 409 por stock debe llegar al usuario con el
 * mensaje del backend, distinguible de un error generico.
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
  saldo: 0, umed: 'U', cantcaja: 1, pesocaja: 1, cubicaja: 1,
  nroingreso: '2024-001', es_nuevo: false, categoria: null,
  imagen_url: null, fecha_ingreso: new Date(), updated_at: new Date(),
  stock_minimo: null as any,
};

const admin: UserSession = { id: '1', rut: '1-1', nombre: 'Admin', rol: 'admin', empresas: [1] };
const vendedor: UserSession = { id: '2', rut: '2-2', nombre: 'Vend', rol: 'vendedor', empresas: [1] };

const mockFetch = (respuesta: { ok: boolean; status: number; body: any }) => {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (String(url).includes('eliminar')) {
      return Promise.resolve({
        ok: respuesta.ok,
        status: respuesta.status,
        json: () => Promise.resolve(respuesta.body),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
  });
};

const renderDrawer = (session: UserSession, onOpenChange = jest.fn(), onUpdated = jest.fn()) => {
  render(
    <ProductDrawer
      producto={mockProducto}
      session={session}
      open={true}
      onOpenChange={onOpenChange}
      onUpdated={onUpdated}
    />
  );
  return { onOpenChange, onUpdated };
};

const abrirModal = () => fireEvent.click(screen.getByTestId('eliminar-producto-btn'));

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve([]) });
  global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  jest.clearAllMocks();
});

describe('ProductDrawer — eliminar producto', () => {
  test('vendedor NO ve el boton Eliminar', () => {
    renderDrawer(vendedor);
    expect(screen.queryByTestId('eliminar-producto-btn')).toBeNull();
  });

  test('admin SI ve el boton Eliminar', () => {
    renderDrawer(admin);
    expect(screen.getByTestId('eliminar-producto-btn')).toBeInTheDocument();
  });

  test('al hacer clic abre confirmacion que pide escribir el codigo', () => {
    renderDrawer(admin);
    abrirModal();
    expect(screen.getByTestId('confirmar-eliminar-input')).toBeInTheDocument();
  });

  test('confirmar esta deshabilitado sin escribir nada', () => {
    renderDrawer(admin);
    abrirModal();
    expect(screen.getByTestId('confirmar-eliminar-btn')).toBeDisabled();
  });

  test('codigo incorrecto → confirmar sigue deshabilitado', () => {
    renderDrawer(admin);
    abrirModal();
    fireEvent.change(screen.getByTestId('confirmar-eliminar-input'), { target: { value: 'OTRO' } });
    expect(screen.getByTestId('confirmar-eliminar-btn')).toBeDisabled();
  });

  test('comparacion case-sensitive: "prod-01" NO habilita', () => {
    renderDrawer(admin);
    abrirModal();
    fireEvent.change(screen.getByTestId('confirmar-eliminar-input'), { target: { value: 'prod-01' } });
    expect(screen.getByTestId('confirmar-eliminar-btn')).toBeDisabled();
  });

  test('codigo exacto habilita confirmar', () => {
    renderDrawer(admin);
    abrirModal();
    fireEvent.change(screen.getByTestId('confirmar-eliminar-input'), { target: { value: 'PROD-01' } });
    expect(screen.getByTestId('confirmar-eliminar-btn')).not.toBeDisabled();
  });

  test('codigo con espacios alrededor cuenta como correcto (trim)', () => {
    renderDrawer(admin);
    abrirModal();
    fireEvent.change(screen.getByTestId('confirmar-eliminar-input'), { target: { value: '  PROD-01  ' } });
    expect(screen.getByTestId('confirmar-eliminar-btn')).not.toBeDisabled();
  });

  test('confirmar llama a POST /api/productos/42/eliminar', async () => {
    mockFetch({ ok: true, status: 200, body: { data: { ...mockProducto, activo: false }, message: 'Producto eliminado' } });
    renderDrawer(admin);
    abrirModal();
    fireEvent.change(screen.getByTestId('confirmar-eliminar-input'), { target: { value: 'PROD-01' } });
    fireEvent.click(screen.getByTestId('confirmar-eliminar-btn'));

    await waitFor(() => {
      const call = (global.fetch as jest.Mock).mock.calls.find((c) => String(c[0]).includes('eliminar'));
      expect(call).toBeDefined();
      expect(call[0]).toBe('/api/productos/42/eliminar');
      expect(call[1].method).toBe('POST');
    });
  });

  test('exito: refresca la lista y cierra el drawer', async () => {
    const eliminado = { ...mockProducto, activo: false };
    mockFetch({ ok: true, status: 200, body: { data: eliminado, message: 'Producto eliminado' } });
    const { onUpdated, onOpenChange } = renderDrawer(admin);
    abrirModal();
    fireEvent.change(screen.getByTestId('confirmar-eliminar-input'), { target: { value: 'PROD-01' } });
    fireEvent.click(screen.getByTestId('confirmar-eliminar-btn'));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(eliminado));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('409 por stock: muestra el mensaje del backend tal cual, no un generico', async () => {
    const mensaje = 'No se puede eliminar: el producto tiene stock (saldo: 7 unidades)';
    mockFetch({ ok: false, status: 409, body: { error: mensaje } });
    renderDrawer(admin);
    abrirModal();
    fireEvent.change(screen.getByTestId('confirmar-eliminar-input'), { target: { value: 'PROD-01' } });
    fireEvent.click(screen.getByTestId('confirmar-eliminar-btn'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(mensaje));
  });

  test('400 ya eliminado: muestra el mensaje del backend tal cual', async () => {
    mockFetch({ ok: false, status: 400, body: { error: 'Este producto ya fue eliminado' } });
    renderDrawer(admin);
    abrirModal();
    fireEvent.change(screen.getByTestId('confirmar-eliminar-input'), { target: { value: 'PROD-01' } });
    fireEvent.click(screen.getByTestId('confirmar-eliminar-btn'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Este producto ya fue eliminado'));
  });

  test('al fallar NO cierra el drawer ni refresca la lista', async () => {
    mockFetch({ ok: false, status: 409, body: { error: 'No se puede eliminar: el producto tiene stock (saldo: 7 unidades)' } });
    const { onUpdated, onOpenChange } = renderDrawer(admin);
    abrirModal();
    fireEvent.change(screen.getByTestId('confirmar-eliminar-input'), { target: { value: 'PROD-01' } });
    fireEvent.click(screen.getByTestId('confirmar-eliminar-btn'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onUpdated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  test('cancelar cierra el modal sin llamar al endpoint', () => {
    renderDrawer(admin);
    abrirModal();
    fireEvent.click(screen.getByTestId('cancelar-eliminar-btn'));

    expect(screen.queryByTestId('confirmar-eliminar-input')).toBeNull();
    expect((global.fetch as jest.Mock).mock.calls.some((c) => String(c[0]).includes('eliminar'))).toBe(false);
  });
});
