/**
 * Fase B — Slice 4c: descuento especial por mayor en carrito y checkout.
 * El servidor decide la modalidad; la UI solo muestra el precio especial cuando
 * la cantidad total del producto alcanza minimo_mayor y el flag está activo.
 */
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CarritoProvider, useCarrito, ItemCarrito } from '@/contexts/CarritoContext';
import { CarritoDrawer } from '@/components/CarritoDrawer';
import { BotonAgregarPedido } from '@/components/BotonAgregarPedido';

jest.mock('@/config/feature-flags.json', () => ({
  'tienda-mayor-online': true,
  'tienda-pago-online': true,
}));
jest.mock('sonner', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}));

const flags = jest.requireMock('@/config/feature-flags.json') as Record<string, boolean>;

const KEY = 'esquina:pedido';

function Seed({ items, contacto }: { items: ItemCarrito[]; contacto?: boolean }) {
  const { setContacto, agregarItem } = useCarrito();
  useEffect(() => {
    if (contacto) setContacto({ nombre: 'Juana', telefono: '1', email: 'juana@mail.com' });
    items.forEach(agregarItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function Probe() {
  const { items, totalItems } = useCarrito();
  return (
    <div>
      <span data-testid="total">{totalItems}</span>
      <span data-testid="len">{items.length}</span>
      {items.map((i) => (
        <span key={i.producto_id} data-testid={`item-${i.producto_id}`}>
          {i.cantidad}:{i.precio}:{i.precio_mayor}:{i.minimo_mayor}
        </span>
      ))}
    </div>
  );
}

const producto = (cantidad: number, over: Partial<ItemCarrito> = {}): ItemCarrito => ({
  producto_id: 1,
  codigo: '1055',
  detalle: 'Gallinita',
  cantidad,
  precio: 1000,
  precio_mayor: 800,
  minimo_mayor: 6,
  ...over,
});

function mockOpciones() {
  (global as any).fetch = jest.fn((url: any) =>
    String(url).includes('/api/entrega/opciones')
      ? Promise.resolve({
          ok: true,
          json: async () => ({ data: [{ codigo: 'retiro', nombre: 'Retiro en tienda', costo: 0, requiere_direccion: false, nota: null }] }),
        })
      : new Promise(() => {}),
  );
}

async function abrirDrawer(items: ItemCarrito[]) {
  mockOpciones();
  render(
    <CarritoProvider origen="productos">
      <Seed items={items} contacto />
      <CarritoDrawer />
    </CarritoProvider>,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  flags['tienda-mayor-online'] = true;
});

describe('carrito con descuento especial (flag ON)', () => {
  test('cantidad = mínimo → línea con descuento y total correcto', async () => {
    await abrirDrawer([producto(6)]);
    expect((await screen.findAllByText('Descuento especial')).length).toBeGreaterThan(0);
    expect(screen.getByTestId('subtotal').textContent).toBe('$6.000');
    expect(screen.getByTestId('descuento').textContent).toBe('-$1.200');
    expect(screen.getByTestId('total-estimado').textContent).toBe('$4.800');
  });

  test('cantidad = mínimo - 1 → sin descuento', async () => {
    await abrirDrawer([producto(5)]);
    expect(await screen.findByTestId('subtotal')).toHaveTextContent('$5.000');
    expect(screen.queryByTestId('descuento')).not.toBeInTheDocument();
    expect(screen.getByTestId('total-estimado').textContent).toBe('$5.000');
  });

  test('sin minimo_mayor → nunca descuenta', async () => {
    await abrirDrawer([producto(99, { minimo_mayor: null })]);
    expect(await screen.findByTestId('subtotal')).toHaveTextContent('$99.000');
    expect(screen.queryByTestId('descuento')).not.toBeInTheDocument();
  });

  test('flag OFF → nunca descuenta aunque cumpla', async () => {
    flags['tienda-mayor-online'] = false;
    await abrirDrawer([producto(99)]);
    expect(await screen.findByTestId('subtotal')).toHaveTextContent('$99.000');
    expect(screen.queryByTestId('descuento')).not.toBeInTheDocument();
    expect(screen.getByTestId('total-estimado').textContent).toBe('$99.000');
  });

  test('el POST solo manda producto_id y cantidad', async () => {
    await abrirDrawer([producto(6)]);
    const fetchMock = (global as any).fetch as jest.Mock;
    await screen.findByRole('option', { name: /Retiro en tienda/ });
    fireEvent.change(screen.getByLabelText(/opción de entrega/i), { target: { value: 'retiro' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar pedido/i }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/pedidos'))).toBe(true));
    const post = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/pedidos')) as any;
    const body = JSON.parse(post[1].body);
    expect(body.items).toEqual([{ producto_id: 1, cantidad: 6 }]);
  });
});

describe('botón agrega 1 unidad y suma', () => {
  test('dos clics → una línea con cantidad 2', async () => {
    const item = { producto_id: 1, codigo: 'A', detalle: 'Producto A', precio: 500, precio_mayor: 400, minimo_mayor: 3 };
    render(
      <CarritoProvider origen="productos">
        <Seed items={[]} contacto />
        <BotonAgregarPedido item={item} />
        <Probe />
      </CarritoProvider>,
    );
    const boton = screen.getByRole('button', { name: /agregar al pedido/i });
    fireEvent.click(boton);
    fireEvent.click(boton);
    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('2'));
    expect(screen.getByTestId('len').textContent).toBe('1');
    expect(screen.getByTestId('item-1').textContent).toBe('2:500:400:3');
  });
});

describe('hidratación de carrito viejo', () => {
  test('descarta líneas caja/mayor, une duplicados y completa precios en null', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      contacto: { nombre: 'Juana', telefono: '1' },
      items: [
        { producto_id: 1, codigo: 'A', detalle: 'A', cantidad: 2, modalidad: 'unidad', precio: 500, precio_referencia: 500, cantcaja: 6 },
        { producto_id: 1, codigo: 'A', detalle: 'A', cantidad: 3, modalidad: 'unidad', precio: 500, precio_referencia: 500, cantcaja: 6 },
        { producto_id: 2, codigo: 'B', detalle: 'B', cantidad: 1, modalidad: 'caja', precio: 3000, precio_referencia: 500, cantcaja: 6 },
        { producto_id: 3, codigo: 'C', detalle: 'C', cantidad: 1, modalidad: 'mayor', precio: 800, precio_referencia: 1000, cantcaja: 1 },
      ],
    }));

    render(
      <CarritoProvider origen="productos">
        <Probe />
      </CarritoProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('len').textContent).toBe('1'));
    expect(screen.getByTestId('total').textContent).toBe('5');
    expect(screen.getByTestId('item-1').textContent).toBe('5:500::');
  });
});
