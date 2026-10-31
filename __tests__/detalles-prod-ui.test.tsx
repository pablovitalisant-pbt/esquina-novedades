/**
 * @jest-environment jsdom
 *
 * Fase B — slice detalles-prod: P1 (tabla sin columna Emp.), P2 (singular),
 * P3 (cuenta sugerida en POS), P4 (imagen 15 MB), P5 (origen visible).
 */
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TiendaHeader } from '@/components/tienda/TiendaHeader';
import { PosCobrarDialog } from '@/components/PosCobrarDialog';
import { PreciosClient } from '@/app/(app)/precios/client_page';
import { PedidosPage } from '@/app/(app)/pedidos/client_page';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/config/feature-flags.json', () => require('@/__tests__/helpers/mockFlags').mockFlags({}));
jest.mock('@/components/ProductCard', () => ({ ProductCard: () => null }));
jest.mock('@/components/ProductDrawer', () => ({ ProductDrawer: () => null }));
jest.mock('@/contexts/CarritoContext', () => ({ useCarrito: () => ({ totalItems: 1 }) }));
jest.mock('@/lib/imagen-reducir', () => {
  const actual = jest.requireActual('@/lib/imagen-reducir');
  return { ...actual, reducirImagen: jest.fn(async () => 'data:image/jpeg;base64,REDUCIDA') };
});

import { reducirImagen } from '@/lib/imagen-reducir';
const mockReducir = reducirImagen as jest.Mock;

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  (global as any).URL.createObjectURL = jest.fn(() => 'blob:mock');
});

describe('detalles-prod — P1 tabla Caja Mayor', () => {
  it('no muestra la columna Emp. ni el badge fijo BN', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../app/(app)/caja-mayor/client_page.tsx'),
      'utf-8'
    );
    expect(src).not.toContain('>Emp.<');
    expect(src).not.toContain('>BN<');
  });
});

describe('detalles-prod — P2 carrito', () => {
  it('usa singular con un artículo', () => {
    render(<TiendaHeader busqueda="" onBusqueda={() => {}} />);
    expect(screen.getByTestId('carrito-header')).toHaveAttribute('aria-label', 'Carrito, 1 artículo');
  });
});

describe('detalles-prod — P3 cuenta sugerida', () => {
  const CUENTAS = [
    { id: 1, nombre: 'Mercado Pago', activa: true, orden: 1 },
    { id: 2, nombre: 'Caja diaria', activa: true, orden: 2 },
  ];

  function montar(usuarioId = '7') {
    global.fetch = jest.fn(async (url: string) => {
      if (url === '/api/caja/cuentas?activas=true') return json({ data: CUENTAS });
      return json({ error: 'no mockeado' }, 500);
    }) as any;
    render(
      <PosCobrarDialog
        open
        onOpenChange={jest.fn()}
        notaId="9"
        saldoPendiente={10000}
        usuarioId={usuarioId}
        onNuevaVenta={jest.fn()}
      />
    );
    return screen.getByTestId('pos-cuenta') as HTMLSelectElement;
  }

  it('sin predeterminada, efectivo elige la cuenta de caja y no la primera', async () => {
    const select = montar();
    await waitFor(() => expect(select.value).toBe('2'));
    fireEvent.click(screen.getByTestId('pos-forma-tarjeta'));
    await waitFor(() => expect(select.value).toBe('1'));
  });

  it('respeta la cuenta predeterminada guardada', async () => {
    localStorage.setItem('pos-cuenta-default-7', '1');
    const select = montar();
    await waitFor(() => expect(select.value).toBe('1'));
  });

  it('no recalcula la cuenta si el usuario la eligio a mano', async () => {
    const select = montar();
    await waitFor(() => expect(select.value).toBe('2'));
    fireEvent.change(select, { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('pos-forma-transferencia'));
    expect(select.value).toBe('1');
  });
});

describe('detalles-prod — P4 imagen de Nuevo producto', () => {
  it('acepta y reduce una imagen de 15 MB', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (String(url).includes('/api/productos/upload')) {
        return json({ data: { imagen_url: 'https://x/y.jpg' } });
      }
      if (String(url) === '/api/productos') return json({ data: { codigo: 'BZ-001' } });
      return json({ data: [] });
    });
    global.fetch = fetchMock as any;

    render(<PreciosClient session={{ rol: 'admin', user: { id: '1', rol: 'admin' } } as any} />);
    fireEvent.click(screen.getByRole('button', { name: /Agregar producto/i }));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toContain('image/jpg');

    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: 15 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByAltText('Preview')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('crear-codigo'), { target: { value: 'BZ-001' } });
    fireEvent.change(screen.getByTestId('crear-detalle'), { target: { value: 'Producto' } });
    fireEvent.change(screen.getByTestId('crear-costo'), { target: { value: '1000' } });
    fireEvent.change(screen.getByTestId('crear-prcventa'), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: /^Crear producto$/i }));

    await waitFor(() => expect(mockReducir).toHaveBeenCalledWith(file));
    await waitFor(() => {
      const upload = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/productos/upload'));
      expect(JSON.parse((upload as any)[1].body).imageBase64).toBe('data:image/jpeg;base64,REDUCIDA');
    });
  });
});

describe('detalles-prod — P5 origen de pedido', () => {
  it('muestra "Tienda online" para el origen legado productos', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (String(url) === '/api/pedidos') {
        return json({
          data: [{
            id: 'p1',
            cliente: { id: null, nombre: 'Ana', telefono: '123' },
            email_contacto: null,
            origen: 'productos',
            estado: 'pendiente',
            entrega_codigo: 'retiro',
            entrega_costo: 0,
            direccion_entrega: null,
            total: 1000,
            created_at: '2026-10-31T10:00:00Z',
            items: [],
          }],
        });
      }
      return json({}, 404);
    }) as any;

    render(<PedidosPage session={{ rol: 'admin', user: { id: '1', rol: 'admin' } } as any} />);
    const nombre = await screen.findByText('Ana');
    fireEvent.click(nombre.closest('button') as HTMLButtonElement);

    expect(await screen.findByText(/Origen: Tienda online/)).toBeInTheDocument();
  });
});
