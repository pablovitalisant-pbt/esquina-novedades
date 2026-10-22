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

jest.mock('sonner', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}));

const KEY = 'bazarnaty:pedido';

const ITEM_A: ItemCarrito = { producto_id: 1, codigo: 'A', detalle: 'Producto A', cantidad: 1, precio_referencia: 5, cantcaja: 6 };
const ITEM_B: ItemCarrito = { producto_id: 2, codigo: 'B', detalle: 'Producto B', cantidad: 2, precio_referencia: 9, cantcaja: 12 };

function TotalProbe() {
  const { totalItems, items } = useCarrito();
  return (
    <div>
      <span data-testid="total">{totalItems}</span>
      <span data-testid="len">{items.length}</span>
    </div>
  );
}

function Seed({ contacto, items }: { contacto?: { nombre: string; telefono: string }; items?: ItemCarrito[] }) {
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
      <CarritoProvider origen="productos" dolarDia={1100}>
        <TotalProbe />
      </CarritoProvider>
    );
    expect(ssrHtml).toContain('>0<');

    // En el cliente, el effect de hidratación restaura lo persistido.
    render(
      <CarritoProvider origen="productos" dolarDia={1100}>
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
      <CarritoProvider origen="productos" dolarDia={1100}>
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
      <CarritoProvider origen="productos" dolarDia={1100}>
        <BotonAgregarPedido item={ITEM_A} />
        <TotalProbe />
      </CarritoProvider>
    );

    // Primer clic sin contacto → abre el gate, NO agrega todavía
    fireEvent.click(screen.getByRole('button', { name: /agregar al pedido/i }));
    await waitFor(() => expect(screen.getByText(/a qué nombre armamos el pedido/i)).toBeInTheDocument());
    expect(screen.getByTestId('total').textContent).toBe('0');

    // Confirmar el gate con nombre+teléfono
    fireEvent.change(screen.getByPlaceholderText('Tu nombre'), { target: { value: 'Juana Pérez' } });
    fireEvent.change(screen.getByPlaceholderText('+591 700 12345'), { target: { value: '+591 700 12345' } });
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
      <CarritoProvider origen="productos" dolarDia={1100}>
        <BotonAgregarPedido item={ITEM_A} />
        <TotalProbe />
      </CarritoProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /agregar al pedido/i }));
    await waitFor(() => expect(screen.getByText(/a qué nombre armamos el pedido/i)).toBeInTheDocument());

    // Submit con todo vacío → error, no se agrega
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(screen.getByText(/completá tu nombre y teléfono/i)).toBeInTheDocument();
    expect(screen.getByTestId('total').textContent).toBe('0');
  });
});

// ─── R2 Doble envío ───────────────────────────────────────────────────
describe('R2 — Guard contra doble envío (CarritoDrawer)', () => {
  it('dos clics en "Enviar pedido" mientras carga → un solo fetch', async () => {
    (global as any).fetch = jest.fn(() => new Promise(() => {})); // nunca resuelve

    render(
      <CarritoProvider origen="catalogo" origen_slug="juegos" dolarDia={1100}>
        <Seed contacto={{ nombre: 'Juana', telefono: '1' }} items={[ITEM_A, ITEM_B]} />
        <CarritoDrawer />
      </CarritoProvider>
    );

    // Abrir el drawer (el trigger aparece con items)
    await waitFor(() => expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));

    const enviar = await screen.findByRole('button', { name: /enviar pedido/i });
    fireEvent.click(enviar);
    fireEvent.click(enviar);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });
});

// ─── R4 API falla → no pierde items ───────────────────────────────────
describe('R4 — Error del POST conserva los items', () => {
  it('respuesta 400/500 → toast.error y los items siguen en el carrito', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Telefono requerido' }),
    });

    render(
      <CarritoProvider origen="productos" dolarDia={1100}>
        <Seed contacto={{ nombre: 'Juana', telefono: '1' }} items={[ITEM_A, ITEM_B]} />
        <CarritoDrawer />
        <TotalProbe />
      </CarritoProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));

    const enviar = await screen.findByRole('button', { name: /enviar pedido/i });
    fireEvent.click(enviar);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // Items intactos (total = 1+2 = 3), el drawer sigue abierto
    expect(screen.getByTestId('total').textContent).toBe('3');
  });

  it('respuesta 201 → toast.success, limpia items y conserva contacto', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 'x' } }),
    });

    render(
      <CarritoProvider origen="productos" dolarDia={1100}>
        <Seed contacto={{ nombre: 'Juana', telefono: '1' }} items={[ITEM_A]} />
        <CarritoDrawer />
        <TotalProbe />
      </CarritoProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));

    const enviar = await screen.findByRole('button', { name: /enviar pedido/i });
    fireEvent.click(enviar);

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    // limpiar() borra items (total 0) y conserva contacto
    expect(screen.getByTestId('total').textContent).toBe('0');
    // El trigger flotante desaparece sin items
    await waitFor(() => expect(screen.queryByRole('button', { name: /abrir carrito/i })).not.toBeInTheDocument());
  });
});

// ─── Precio en el Drawer: por caja (formatUSD + formatArsEquivalente) ─
describe('Precio por item en el Drawer', () => {
  it('muestra precio por caja (USD + ARS) y equivalencia en unidades', async () => {
    (global as any).fetch = jest.fn(() => new Promise(() => {}));

    render(
      <CarritoProvider origen="productos" dolarDia={1100}>
        <Seed contacto={{ nombre: 'Juana', telefono: '1' }} items={[ITEM_A]} />
        <CarritoDrawer />
      </CarritoProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));

    // ITEM_A: precio_referencia 5 * cantcaja 6 = 30 → "$30.00 / caja"
    await screen.findByText('$30.00 / caja');
    // formatArsEquivalente(30, 1100) → "≈ AR$ 33,000.00".
    // Con ITEM_A solo, el ARS aparece dos veces: en el precio por item y en el
    // total de la compra (30 → ARS 33,000 en ambos).
    expect(screen.getAllByText('≈ AR$ 33,000.00')).toHaveLength(2);
    // cantidad 1 caja → "1 caja" · "= 6 unidades"
    expect(screen.getByText('1 caja')).toBeInTheDocument();
    expect(screen.getByText('= 6 unidades')).toBeInTheDocument();
  });
});

// ─── Total de la compra en el Drawer ────────────────────────────────
describe('Total de la compra en el Drawer', () => {
  it('suma precio_referencia × cantcaja × cantidad por item → formatUSD', async () => {
    (global as any).fetch = jest.fn(() => new Promise(() => {}));

    render(
      <CarritoProvider origen="productos" dolarDia={1100}>
        <Seed contacto={{ nombre: 'Juana', telefono: '1' }} items={[ITEM_A, ITEM_B]} />
        <CarritoDrawer />
      </CarritoProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));

    // ITEM_A 5*6*1=30, ITEM_B 9*12*2=216 → total 246 → "$246.00"
    await screen.findByText('$246.00');
  });

  it('item sin precio_referencia se excluye del total y muestra el indicador', async () => {
    (global as any).fetch = jest.fn(() => new Promise(() => {}));
    const SIN_PRECIO: ItemCarrito = {
      producto_id: 3, codigo: 'C', detalle: 'Sin precio', cantidad: 1, precio_referencia: null, cantcaja: 6,
    };

    render(
      <CarritoProvider origen="productos" dolarDia={1100}>
        <Seed contacto={{ nombre: 'Juana', telefono: '1' }} items={[ITEM_A, SIN_PRECIO]} />
        <CarritoDrawer />
      </CarritoProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));

    // Solo ITEM_A cuenta: 5*6*1=30 → "$30.00"
    await screen.findByText('$30.00');
    expect(screen.getByText(/algunos productos sin precio no incluidos/i)).toBeInTheDocument();
  });
});
