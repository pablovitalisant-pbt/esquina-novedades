/**
 * Fase B — Slice 2a (Carrito). Tests que fuerzan las condiciones de riesgo:
 *   R1 Hydration (localStorage solo en effect)
 *   R2 Doble envío (guard en el botón "Enviar pedido")
 *   R3 Estado compartido + merge por producto
 *   R4 API falla → no pierde items
 */

import { useEffect } from 'react';
import { renderToString } from 'react-dom/server';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { CarritoProvider, useCarrito, ItemCarrito } from '@/contexts/CarritoContext';
import { BotonAgregarPedido } from '@/components/BotonAgregarPedido';
import { CarritoDrawer } from '@/components/CarritoDrawer';

jest.mock('@/config/feature-flags.json', () => ({ 'tienda-mayor-online': false }));

jest.mock('sonner', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}));

const mockRedirigir = jest.fn();
jest.mock('@/lib/redirigir', () => ({
  redirigirA: (...args: any[]) => mockRedirigir(...args),
}));

const KEY = 'esquina:pedido';

const ITEM_A: ItemCarrito = { producto_id: 1, codigo: 'A', detalle: 'Producto A', cantidad: 1, precio: 30, precio_mayor: null, minimo_mayor: null };
const ITEM_B: ItemCarrito = { producto_id: 2, codigo: 'B', detalle: 'Producto B', cantidad: 2, precio: 108, precio_mayor: null, minimo_mayor: null };

function TotalProbe() {
  const { totalItems, items } = useCarrito();
  return (
    <div>
      <span data-testid="total">{totalItems}</span>
      <span data-testid="len">{items.length}</span>
    </div>
  );
}

const OPCIONES = {
  data: [
    { codigo: 'retiro', nombre: 'Retiro en tienda', costo: 0, requiere_direccion: false, nota: null },
    { codigo: 'delivery_iquique', nombre: 'Delivery Iquique', costo: 3000, requiere_direccion: true, nota: null },
  ],
};

// El drawer pide opciones al montar; el POST es el que este test controla.
function mockFetch(post: any) {
  const fetchMock = jest.fn((url: any) => {
    if (String(url).includes('/api/entrega/opciones')) {
      return Promise.resolve({ ok: true, json: async () => OPCIONES });
    }
    return post;
  });
  (global as any).fetch = fetchMock;
  return fetchMock;
}

const posts = (fetchMock: jest.Mock) =>
  fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/pedidos')).length;

async function elegirRetiro() {
  await screen.findByRole('option', { name: /Retiro en tienda/ });
  fireEvent.change(screen.getByLabelText(/opción de entrega/i), { target: { value: 'retiro' } });
}

function Seed({ contacto, items }: { contacto?: { nombre: string; telefono: string; email?: string }; items?: ItemCarrito[] }) {
  const { setContacto, agregarItem } = useCarrito();
  useEffect(() => {
    if (contacto) setContacto(contacto);
    items?.forEach(agregarItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  // Reset de fetch a un mock por defecto no-enviado
  (global as any).fetch = jest.fn();
});

// ─── R1 Hydration: localStorage se lee en effect, no durante el render ──
describe('R1 — Hydration (localStorage solo en effect)', () => {
  it('el render estático (SSR) sale vacío aunque haya datos en storage; el montaje carga por effect', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        contacto: { nombre: 'Juana', telefono: '591700' },
        items: [ITEM_A],
      })
    );

    // Simula el render del servidor (no corre effects). Debe salir vacío:
    // si el componente leyera localStorage durante el render, habría un
    // mismatch de hidratación y esto fallaría (>1< en vez de >0<).
    const ssrHtml = renderToString(
      <CarritoProvider origen="productos">
        <TotalProbe />
      </CarritoProvider>
    );
    expect(ssrHtml).toContain('>0<');

    // En el cliente, el effect de hidratación restaura lo persistido.
    render(
      <CarritoProvider origen="productos">
        <TotalProbe />
      </CarritoProvider>
    );
    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('1'));
    expect(screen.getByTestId('len').textContent).toBe('1');
  });
});

// ─── R3 Estado compartido: agregar el mismo producto fusiona cantidad ──
describe('R3 — Merge por producto', () => {
  it('agregar dos veces el mismo producto_id fusiona la cantidad (1 item, no duplica)', () => {
    function Harness() {
      const { agregarItem } = useCarrito();
      return (
        <>
          <TotalProbe />
          <button onClick={() => agregarItem(ITEM_A)}>add</button>
        </>
      );
    }
    render(
      <CarritoProvider origen="productos">
        <Harness />
      </CarritoProvider>
    );

    const btn = screen.getByRole('button', { name: 'add' });
    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(screen.getByTestId('len').textContent).toBe('1'); // 1 item
    expect(screen.getByTestId('total').textContent).toBe('2'); // cantidad 2
  });
});

// ─── Gate obligatorio: no entra item sin nombre+teléfono ──────────────
describe('Gate obligatorio (BotonAgregarPedido)', () => {
  it('sin contacto: abre el modal, no agrega hasta confirmar; luego agrega directo', async () => {
    render(
      <CarritoProvider origen="productos">
        <BotonAgregarPedido item={ITEM_A} />
        <TotalProbe />
      </CarritoProvider>
    );

    // Primer clic sin contacto → abre el gate, NO agrega todavía
    fireEvent.click(screen.getByRole('button', { name: /agregar al pedido/i }));
    await waitFor(() => expect(screen.getByText(/a qué nombre armamos el pedido/i)).toBeInTheDocument());
    expect(screen.getByTestId('total').textContent).toBe('0');

    // Confirmar el gate con nombre+teléfono+email
    fireEvent.change(screen.getByPlaceholderText('Tu nombre'), { target: { value: 'Juana Pérez' } });
    fireEvent.change(screen.getByPlaceholderText('+56 9 1234 5678'), { target: { value: '+56 9 1234 5678' } });
    fireEvent.change(screen.getByPlaceholderText('tu@email.com'), { target: { value: 'juana@mail.com' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    // El item pendiente se agrega recién tras confirmar
    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('1'));

    // Segundo clic: contacto ya guardado → agrega directo sin modal
    fireEvent.click(screen.getByRole('button', { name: /agregar al pedido/i }));
    expect(screen.getByTestId('total').textContent).toBe('2');
    expect(screen.queryByText(/a qué nombre armamos el pedido/i)).not.toBeInTheDocument();
  });

  it('el gate valida campos vacíos y no confirma', async () => {
    render(
      <CarritoProvider origen="productos">
        <BotonAgregarPedido item={ITEM_A} />
        <TotalProbe />
      </CarritoProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /agregar al pedido/i }));
    await waitFor(() => expect(screen.getByText(/a qué nombre armamos el pedido/i)).toBeInTheDocument());

    // Submit con todo vacío → error, no se agrega
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(screen.getByText(/completa tu nombre, teléfono y email/i)).toBeInTheDocument();
    expect(screen.getByTestId('total').textContent).toBe('0');
  });
});

// ─── R2 Doble envío ───────────────────────────────────────────────────
describe('R2 — Guard contra doble envío (CarritoDrawer)', () => {
  it('dos clics en "Enviar pedido" mientras carga → un solo POST', async () => {
    const fetchMock = mockFetch(new Promise(() => {})); // el POST nunca resuelve

    render(
      <CarritoProvider origen="catalogo" origen_slug="juegos">
        <Seed contacto={{ nombre: 'Juana', telefono: '1', email: 'juana@mail.com' }} items={[ITEM_A, ITEM_B]} />
        <CarritoDrawer />
      </CarritoProvider>
    );

    // Abrir el drawer (el trigger aparece con items)
    await waitFor(() => expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));
    await elegirRetiro();

    const enviar = await screen.findByRole('button', { name: /enviar pedido/i });
    fireEvent.click(enviar);
    fireEvent.click(enviar);

    await waitFor(() => expect(posts(fetchMock)).toBe(1));
  });
});

// ─── R4 API falla → no pierde items ───────────────────────────────────
describe('R4 — Error del POST conserva los items', () => {
  it('respuesta 400/500 → error inline y los items siguen en el carrito', async () => {
    mockFetch(Promise.resolve({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Telefono requerido' }),
    }));

    render(
      <CarritoProvider origen="productos">
        <Seed contacto={{ nombre: 'Juana', telefono: '1', email: 'juana@mail.com' }} items={[ITEM_A, ITEM_B]} />
        <CarritoDrawer />
        <TotalProbe />
      </CarritoProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));
    await elegirRetiro();

    const enviar = await screen.findByRole('button', { name: /enviar pedido/i });
    fireEvent.click(enviar);

    // El error queda visible dentro del carrito.
    expect(await screen.findByRole('alert')).toHaveTextContent('Telefono requerido');
    // Items intactos (total = 1+2 = 3), el drawer sigue abierto
    expect(screen.getByTestId('total').textContent).toBe('3');
  });

  it('409 sin stock → el carrito muestra un mensaje visible con el detalle y conserva los items', async () => {
    mockFetch(Promise.resolve({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Stock insuficiente', items: [{ codigo: 'A', disponible: 2, solicitado: 6 }] }),
    }));

    render(
      <CarritoProvider origen="productos">
        <Seed contacto={{ nombre: 'Juana', telefono: '1', email: 'juana@mail.com' }} items={[ITEM_A]} />
        <CarritoDrawer />
        <TotalProbe />
      </CarritoProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));
    await elegirRetiro();
    fireEvent.click(await screen.findByRole('button', { name: /enviar pedido/i }));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(/no hay stock suficiente/i);
    expect(alerta).toHaveTextContent('A (quedan 2, pediste 6)');
    expect(screen.getByTestId('total').textContent).toBe('1');
  });

  it('error de red → mensaje visible en el carrito', async () => {
    mockFetch(Promise.reject(new Error('offline')));

    render(
      <CarritoProvider origen="productos">
        <Seed contacto={{ nombre: 'Juana', telefono: '1', email: 'juana@mail.com' }} items={[ITEM_A]} />
        <CarritoDrawer />
      </CarritoProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));
    await elegirRetiro();
    fireEvent.click(await screen.findByRole('button', { name: /enviar pedido/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos conectarnos/i);
  });

  it('respuesta 201 → toast.success, limpia items y conserva contacto', async () => {    mockFetch(Promise.resolve({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 'x' } }),
    }));

    render(
      <CarritoProvider origen="productos">
        <Seed contacto={{ nombre: 'Juana', telefono: '1', email: 'juana@mail.com' }} items={[ITEM_A]} />
        <CarritoDrawer />
        <TotalProbe />
      </CarritoProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));
    await elegirRetiro();

    const enviar = await screen.findByRole('button', { name: /enviar pedido/i });
    fireEvent.click(enviar);

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    // limpiar() borra items (total 0) y conserva contacto
    expect(screen.getByTestId('total').textContent).toBe('0');
    // El trigger flotante desaparece sin items
    await waitFor(() => expect(screen.queryByRole('button', { name: /abrir carrito/i })).not.toBeInTheDocument());
  });

  it('201 con init_point → limpia, cierra y redirige a Mercado Pago', async () => {
    mockFetch(Promise.resolve({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 'x', init_point: 'https://mp.example/checkout' } }),
    }));

    render(
      <CarritoProvider origen="productos">
        <Seed contacto={{ nombre: 'Juana', telefono: '1', email: 'juana@mail.com' }} items={[ITEM_A]} />
        <CarritoDrawer />
        <TotalProbe />
      </CarritoProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));
    await elegirRetiro();

    fireEvent.click(await screen.findByRole('button', { name: /enviar pedido/i }));

    await waitFor(() => expect(mockRedirigir).toHaveBeenCalledWith('https://mp.example/checkout'));
    expect(screen.getByTestId('total').textContent).toBe('0');
    await waitFor(() => expect(screen.queryByRole('button', { name: /abrir carrito/i })).not.toBeInTheDocument());
  });
});

// ─── Precio en el Drawer: por unidad ─
describe('Precio por item en el Drawer', () => {
  it('muestra precio por unidad', async () => {
    (global as any).fetch = jest.fn(() => new Promise(() => {}));

    render(
      <CarritoProvider origen="productos">
        <Seed contacto={{ nombre: 'Juana', telefono: '1' }} items={[ITEM_A]} />
        <CarritoDrawer />
      </CarritoProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));

    await screen.findByText('$30 / unidad');
    expect(screen.queryByText(/AR\$|≈/)).not.toBeInTheDocument();
    expect(screen.getByText('1 unidad')).toBeInTheDocument();
  });
});

// ─── Total de la compra en el Drawer ────────────────────────────────
describe('Total de la compra en el Drawer', () => {
  it('suma precio × cantidad por item', async () => {
    (global as any).fetch = jest.fn(() => new Promise(() => {}));

    render(
      <CarritoProvider origen="productos">
        <Seed contacto={{ nombre: 'Juana', telefono: '1' }} items={[ITEM_A, ITEM_B]} />
        <CarritoDrawer />
      </CarritoProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));

    // ITEM_A 30*1=30, ITEM_B 108*2=216 → total 246
    await waitFor(() => expect(screen.getByTestId('subtotal').textContent).toBe('$246'));
  });

  it('item sin precio se excluye del total y muestra el indicador', async () => {
    (global as any).fetch = jest.fn(() => new Promise(() => {}));
    const SIN_PRECIO: ItemCarrito = {
      producto_id: 3, codigo: 'C', detalle: 'Sin precio', cantidad: 1, precio: null, precio_mayor: null, minimo_mayor: null,
    };

    render(
      <CarritoProvider origen="productos">
        <Seed contacto={{ nombre: 'Juana', telefono: '1' }} items={[ITEM_A, SIN_PRECIO]} />
        <CarritoDrawer />
      </CarritoProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));

    // Solo ITEM_A cuenta: 30*1=30
    await waitFor(() => expect(screen.getByTestId('subtotal').textContent).toBe('$30'));
    expect(screen.getByText(/algunos productos sin precio no incluidos/i)).toBeInTheDocument();
  });
});
