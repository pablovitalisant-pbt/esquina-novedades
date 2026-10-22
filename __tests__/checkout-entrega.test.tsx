/**
 * Fase B — Sub-slice 7d: checkout con entrega.
 * Intenta romper: email obligatorio, opción de entrega desde la API,
 * dirección exigida por la opción, nota de Arica, costo y total estimado,
 * y que el cliente NO envíe precios.
 */
import { useEffect } from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { CarritoProvider, useCarrito, ItemCarrito } from '@/contexts/CarritoContext';
import { CarritoDrawer } from '@/components/CarritoDrawer';
import { BotonAgregarPedido } from '@/components/BotonAgregarPedido';

jest.mock('sonner', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}));

const OPCIONES = {
  data: [
    { codigo: 'retiro', nombre: 'Retiro en tienda', costo: 0, requiere_direccion: false, nota: null },
    { codigo: 'delivery_iquique', nombre: 'Delivery Iquique', costo: 3000, requiere_direccion: true, nota: null },
    { codigo: 'envio_arica', nombre: 'Envío a Arica', costo: 0, requiere_direccion: true, nota: 'Se paga al chofer según tamaño' },
  ],
};

const UNIDAD: ItemCarrito = { producto_id: 1, codigo: 'A', detalle: 'Producto A', cantidad: 2, modalidad: 'unidad', precio: 500, precio_referencia: 500, cantcaja: 6 };
const CAJA: ItemCarrito = { producto_id: 2, codigo: 'B', detalle: 'Producto B', cantidad: 1, modalidad: 'caja', precio: 3000, precio_referencia: 500, cantcaja: 6 };

function Seed({ contacto, items }: { contacto?: { nombre: string; telefono: string; email?: string }; items?: ItemCarrito[] }) {
  const { setContacto, agregarItem } = useCarrito();
  useEffect(() => {
    if (contacto) setContacto(contacto);
    items?.forEach(agregarItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function mockFetch(postResponse: any = { ok: true, status: 201, json: async () => ({ data: { id: 'x' } }) }) {
  const fetchMock = jest.fn((url: any) => {
    if (String(url).includes('/api/entrega/opciones')) {
      return Promise.resolve({ ok: true, json: async () => OPCIONES });
    }
    return Promise.resolve(postResponse);
  });
  (global as any).fetch = fetchMock;
  return fetchMock;
}

const postCalls = (fetchMock: jest.Mock) =>
  fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/pedidos')).length;

async function abrirDrawer(items: ItemCarrito[] = [UNIDAD, CAJA]) {
  render(
    <CarritoProvider origen="productos">
      <Seed contacto={{ nombre: 'Juana', telefono: '1', email: 'juana@mail.com' }} items={items} />
      <CarritoDrawer />
    </CarritoProvider>
  );
  await waitFor(() => expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));
  await screen.findByRole('option', { name: /Retiro en tienda/ });
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

describe('Gate con email obligatorio', () => {
  it('sin email no confirma; con email agrega el item', async () => {
    render(
      <CarritoProvider origen="productos">
        <BotonAgregarPedido item={{ producto_id: 1, codigo: 'A', detalle: 'A', precio: 500, cantcaja: 6 }} />
      </CarritoProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /agregar al pedido/i }));
    await screen.findByText(/a qué nombre armamos el pedido/i);

    fireEvent.change(screen.getByLabelText(/^nombre$/i), { target: { value: 'Juana' } });
    fireEvent.change(screen.getByLabelText(/^teléfono$/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(screen.getByText(/completá tu nombre, teléfono y email/i)).toBeInTheDocument();
    expect(screen.queryByText(/a qué nombre armamos el pedido/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'juana@mail.com' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    await waitFor(() => expect(screen.queryByText(/a qué nombre armamos el pedido/i)).not.toBeInTheDocument());
  });
});

describe('Checkout en el drawer', () => {
  it('carga las opciones de entrega desde GET /api/entrega/opciones', async () => {
    const fetchMock = mockFetch();
    await abrirDrawer();

    expect(screen.getByRole('option', { name: /Delivery Iquique/ })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/entrega/opciones'))).toBe(true);
  });

  it('delivery sin dirección no envía; con dirección envía el pedido', async () => {
    const fetchMock = mockFetch();
    await abrirDrawer();

    fireEvent.change(screen.getByLabelText(/opción de entrega/i), { target: { value: 'delivery_iquique' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar pedido/i }));
    expect(screen.getByText(/ingresá la dirección/i)).toBeInTheDocument();
    expect(postCalls(fetchMock)).toBe(0);

    fireEvent.change(screen.getByLabelText(/dirección/i), { target: { value: 'Av. Costanera 123' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar pedido/i }));
    await waitFor(() => expect(postCalls(fetchMock)).toBe(1));
  });

  it('retiro no exige dirección y envía solo producto_id, modalidad y cantidad', async () => {
    const fetchMock = mockFetch();
    await abrirDrawer();

    fireEvent.change(screen.getByLabelText(/opción de entrega/i), { target: { value: 'retiro' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar pedido/i }));
    await waitFor(() => expect(postCalls(fetchMock)).toBe(1));

    const body = JSON.parse(fetchMock.mock.calls.find((c: any) => String(c[0]).includes('/api/pedidos'))![1].body);
    expect(body.email_contacto).toBe('juana@mail.com');
    expect(body.entrega_codigo).toBe('retiro');
    expect(body.direccion_entrega).toBeNull();
    expect(body.items).toEqual([
      { producto_id: 1, modalidad: 'unidad', cantidad: 2 },
      { producto_id: 2, modalidad: 'caja', cantidad: 1 },
    ]);
    expect(body.total).toBeUndefined();
    expect(body.entrega_costo).toBeUndefined();
  });

  it('muestra subtotal, costo de entrega y total estimado', async () => {
    mockFetch();
    await abrirDrawer();

    expect(screen.getByTestId('subtotal').textContent).toBe('$4.000');
    expect(screen.getByTestId('total-estimado').textContent).toBe('$4.000');

    fireEvent.change(screen.getByLabelText(/opción de entrega/i), { target: { value: 'delivery_iquique' } });
    expect(screen.getByTestId('costo-entrega').textContent).toBe('$3.000');
    expect(screen.getByTestId('total-estimado').textContent).toBe('$7.000');
  });

  it('muestra la nota de Arica al elegir envío a Arica', async () => {
    mockFetch();
    await abrirDrawer();

    fireEvent.change(screen.getByLabelText(/opción de entrega/i), { target: { value: 'envio_arica' } });
    expect(screen.getByText(/se paga al chofer/i)).toBeInTheDocument();
  });
});
