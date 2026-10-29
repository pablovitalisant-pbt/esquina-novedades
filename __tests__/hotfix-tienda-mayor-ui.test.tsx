/**
 * Fase B — Hotfix "bloquear precio mayor en tienda online".
 * Puntos 4 (UI sin opción caja) y 5 (hidratación descarta líneas caja).
 * Flag `tienda-mayor-online` mockeado explícitamente (lección BUG-004).
 */
import { useEffect, useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CarritoProvider, useCarrito, ItemCarrito, Modalidad } from '@/contexts/CarritoContext';
import { SelectorModalidad } from '@/components/SelectorModalidad';
import { BotonAgregarPedido } from '@/components/BotonAgregarPedido';
import { formatCLP } from '@/lib/utils';

jest.mock('@/config/feature-flags.json', () => ({
  'tienda-pago-online': false,
  'tienda-mayor-online': false,
}));

jest.mock('@/components/ImageWithFallback', () => ({
  ImageWithFallback: () => <div data-testid="image-fallback" />,
}));

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

const unidad = (): ItemCarrito => ({
  producto_id: 1, codigo: 'A', detalle: 'Producto A', cantidad: 2,
  modalidad: 'unidad', precio: 500, precio_referencia: 500, cantcaja: 6,
});
const caja = (): ItemCarrito => ({
  producto_id: 2, codigo: 'B', detalle: 'Producto B', cantidad: 1,
  modalidad: 'caja', precio: 3000, precio_referencia: 500, cantcaja: 6,
});

function Probe() {
  const { items, contacto, totalItems } = useCarrito();
  return (
    <div>
      <span data-testid="total">{totalItems}</span>
      <span data-testid="len">{items.length}</span>
      <span data-testid="contacto">{contacto?.nombre ?? ''}</span>
      {items.map((i) => (
        <span key={`${i.producto_id}-${i.modalidad}`} data-testid={`item-${i.modalidad}`}>
          {i.cantidad}:{i.precio}
        </span>
      ))}
    </div>
  );
}

function Seed({ contacto, items }: { contacto?: boolean; items?: ItemCarrito[] }) {
  const { setContacto, agregarItem } = useCarrito();
  useEffect(() => {
    if (contacto) setContacto({ nombre: 'Juana', telefono: '1' });
    items?.forEach(agregarItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const PRODUCTO = {
  producto_id: 1,
  codigo: 'A',
  detalle: 'Producto A',
  precio: 500,
  precio_mayor: 3000,
  cantcaja: 6,
  stock: 20,
  umed: 'UND',
};

describe('Punto 4 — la tienda online no ofrece caja', () => {
  test('BotonAgregarPedido no renderiza botón "Caja" y agrega siempre unidad con precio unidad', () => {
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
    expect(screen.getByTestId('item-unidad').textContent).toBe('1:500');
    expect(screen.queryByTestId('item-caja')).not.toBeInTheDocument();
    expect(screen.getByTestId('total').textContent).toBe('1');
  });

  test('SelectorModalidad no ofrece caja aunque haya precio mayorista y cantcaja', () => {
    function Harness() {
      const [modalidad, setModalidad] = useState<Modalidad>('unidad');
      return (
        <>
          <SelectorModalidad
            modalidad={modalidad}
            onChange={setModalidad}
            precioUnidad={500}
            precioMayor={3000}
            cantcaja={6}
            stock={20}
            umed="UND"
          />
          <span data-testid="sel">{modalidad}</span>
        </>
      );
    }
    render(<Harness />);

    expect(screen.getByRole('button', { name: /unidad/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^caja/i })).not.toBeInTheDocument();
    expect(screen.queryByText(formatCLP(3000))).not.toBeInTheDocument();
    expect(screen.queryByText(/caja de/i)).not.toBeInTheDocument();
  });
});

describe('Punto 5 — hidratación desde localStorage descarta líneas caja', () => {
  test('conserva contacto y líneas unidad, elimina las caja', async () => {
    localStorage.setItem('esquina:pedido', JSON.stringify({
      contacto: { nombre: 'Juana', telefono: '1' },
      items: [unidad(), caja()],
    }));

    render(
      <CarritoProvider origen="productos">
        <Probe />
      </CarritoProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('contacto').textContent).toBe('Juana'));
    expect(screen.getByTestId('len').textContent).toBe('1');
    expect(screen.getByTestId('item-unidad').textContent).toBe('2:500');
    expect(screen.queryByTestId('item-caja')).not.toBeInTheDocument();
    expect(screen.getByTestId('total').textContent).toBe('2');

    // El storage queda saneado: una recarga no resucita la caja.
    await waitFor(() => {
      const guardado = JSON.parse(localStorage.getItem('esquina:pedido') as string);
      expect(guardado.items).toHaveLength(1);
      expect(guardado.items[0].modalidad).toBe('unidad');
      expect(guardado.contacto).toEqual({ nombre: 'Juana', telefono: '1' });
    });
  });
});
