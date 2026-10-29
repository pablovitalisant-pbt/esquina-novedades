/**
 * Hotfix "bloquear precio mayor en tienda online" — reemplazado en 4c.
 * Puntos 4 (la tienda no ofrece caja) y 5 (hidratación descarta líneas caja).
 */
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CarritoProvider, useCarrito, ItemCarrito } from '@/contexts/CarritoContext';
import { BotonAgregarPedido } from '@/components/BotonAgregarPedido';

jest.mock('@/config/feature-flags.json', () => ({
  'tienda-pago-online': false,
  'tienda-mayor-online': false,
}));

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

const PRODUCTO = {
  producto_id: 1,
  codigo: 'A',
  detalle: 'Producto A',
  precio: 500,
  precio_mayor: 3000,
  minimo_mayor: 6,
  stock: 20,
  umed: 'UND',
};

function Probe() {
  const { items, contacto, totalItems } = useCarrito();
  return (
    <div>
      <span data-testid="total">{totalItems}</span>
      <span data-testid="len">{items.length}</span>
      <span data-testid="contacto">{contacto?.nombre ?? ''}</span>
      {items.map((i) => (
        <span key={i.producto_id} data-testid="item">
          {i.cantidad}:{i.precio}
        </span>
      ))}
    </div>
  );
}

function Seed({ contacto }: { contacto?: boolean }) {
  const { setContacto } = useCarrito();
  useEffect(() => {
    if (contacto) setContacto({ nombre: 'Juana', telefono: '1' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

describe('Punto 4 — la tienda online no ofrece caja', () => {
  test('BotonAgregarPedido agrega siempre 1 unidad con precio unidad', () => {
    render(
      <CarritoProvider origen="productos">
        <Seed contacto />
        <BotonAgregarPedido item={PRODUCTO} />
        <Probe />
      </CarritoProvider>,
    );

    expect(screen.queryByRole('button', { name: /^caja/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^caja$/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /agregar al pedido/i }));
    expect(screen.getByTestId('item').textContent).toBe('1:500');
    expect(screen.getByTestId('total').textContent).toBe('1');
  });
});

describe('Punto 5 — hidratación desde localStorage descarta líneas caja', () => {
  test('conserva contacto y líneas unidad, elimina las caja', async () => {
    localStorage.setItem('esquina:pedido', JSON.stringify({
      contacto: { nombre: 'Juana', telefono: '1' },
      items: [
        { producto_id: 1, codigo: 'A', detalle: 'A', cantidad: 2, modalidad: 'unidad', precio: 500, precio_referencia: 500, cantcaja: 6 },
        { producto_id: 2, codigo: 'B', detalle: 'B', cantidad: 1, modalidad: 'caja', precio: 3000, precio_referencia: 500, cantcaja: 6 },
      ],
    }));

    render(
      <CarritoProvider origen="productos">
        <Probe />
      </CarritoProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('contacto').textContent).toBe('Juana'));
    expect(screen.getByTestId('len').textContent).toBe('1');
    expect(screen.getByTestId('item').textContent).toBe('2:500');
    expect(screen.getByTestId('total').textContent).toBe('2');

    // El storage queda saneado: una recarga no resucita la caja.
    await waitFor(() => {
      const guardado = JSON.parse(localStorage.getItem('esquina:pedido') as string);
      expect(guardado.items).toHaveLength(1);
      expect(guardado.items[0].producto_id).toBe(1);
      expect(guardado.contacto).toEqual({ nombre: 'Juana', telefono: '1' });
    });
  });
});
