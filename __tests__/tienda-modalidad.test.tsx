/**
 * Fase B — Sub-slice 7c: carrito mixto unidad/caja.
 * Intenta romper: dedupe por producto+modalidad, aislamiento de cantidades,
 * caja bloqueada sin precio_mayor/cantcaja y wiring de las páginas públicas.
 */
import { useEffect, useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CarritoProvider, useCarrito, ItemCarrito, Modalidad } from '@/contexts/CarritoContext';
import { SelectorModalidad } from '@/components/SelectorModalidad';
import { BotonAgregarPedido } from '@/components/BotonAgregarPedido';
import { ProductosPublicos } from '@/app/productos/client_page';
import { PublicCatalogoClient } from '@/app/catalogo/[slug]/client_page';
import { formatCLP } from '@/lib/utils';

jest.mock('@/config/feature-flags.json', () => ({ 'tienda-mayor-online': false }));

jest.mock('@/components/ImageWithFallback', () => ({
  ImageWithFallback: () => <div data-testid="image-fallback" />,
}));

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

const unidad = (cantidad = 1): ItemCarrito => ({  producto_id: 1,
  codigo: 'A',
  detalle: 'Producto A',
  cantidad,
  modalidad: 'unidad',
  precio: 500,
  precio_referencia: 500,
  cantcaja: 6,
});

const caja = (cantidad = 1): ItemCarrito => ({
  ...unidad(cantidad),
  modalidad: 'caja',
  precio: 3000,
  precio_referencia: 500,
});

function Seed({ contacto, items }: { contacto?: boolean; items?: ItemCarrito[] }) {
  const { setContacto, agregarItem } = useCarrito();
  useEffect(() => {
    if (contacto) setContacto({ nombre: 'Juana', telefono: '1' });
    items?.forEach(agregarItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function Probe() {
  const { items, totalItems, quitarItem, actualizarCantidad } = useCarrito();
  return (
    <div>
      <span data-testid="total">{totalItems}</span>
      <span data-testid="len">{items.length}</span>
      {items.map((i) => (
        <span key={`${i.producto_id}-${i.modalidad}`} data-testid={`item-${i.modalidad}`}>
          {i.cantidad}:{i.precio}
        </span>
      ))}
      <button onClick={() => quitarItem(1, 'unidad')}>quitar-unidad</button>
      <button onClick={() => actualizarCantidad(1, 5, 'caja')}>set-caja-5</button>
    </div>
  );
}

function Add({ item }: { item: ItemCarrito }) {
  const { agregarItem } = useCarrito();
  return <button onClick={() => agregarItem(item)}>add</button>;
}

describe('CarritoContext — dedupe por producto + modalidad', () => {
  it('el mismo producto en unidad y caja son dos líneas; repetir una modalidad suma solo esa', () => {
    render(
      <CarritoProvider origen="productos">
        <Add item={unidad()} />
        <Add item={caja()} />
        <Probe />
      </CarritoProvider>
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'add' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'add' })[1]);
    expect(screen.getByTestId('len').textContent).toBe('2');
    expect(screen.getByTestId('total').textContent).toBe('2');

    // Repetir unidad no debe tocar la línea de caja.
    fireEvent.click(screen.getAllByRole('button', { name: 'add' })[0]);
    expect(screen.getByTestId('len').textContent).toBe('2');
    expect(screen.getByTestId('item-unidad').textContent).toBe('2:500');
    expect(screen.getByTestId('item-caja').textContent).toBe('1:3000');
    expect(screen.getByTestId('total').textContent).toBe('3');
  });

  it('quitar/cambiar cantidad por modalidad no mezcla líneas', () => {
    render(
      <CarritoProvider origen="productos">
        <Seed items={[unidad(), caja()]} />
        <Probe />
      </CarritoProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'quitar-unidad' }));
    expect(screen.getByTestId('len').textContent).toBe('1');
    expect(screen.queryByTestId('item-unidad')).not.toBeInTheDocument();
    expect(screen.getByTestId('item-caja').textContent).toBe('1:3000');

    fireEvent.click(screen.getByRole('button', { name: 'set-caja-5' }));
    expect(screen.getByTestId('item-caja').textContent).toBe('5:3000');
  });
});

function SelectorHarness({ precioMayor, cantcaja }: { precioMayor: number | null; cantcaja: number }) {
  const [modalidad, setModalidad] = useState<Modalidad>('unidad');
  return (
    <>
      <SelectorModalidad
        modalidad={modalidad}
        onChange={setModalidad}
        precioUnidad={500}
        precioMayor={precioMayor}
        cantcaja={cantcaja}
        stock={20}
        umed="UND"
      />
      <span data-testid="sel">{modalidad}</span>
    </>
  );
}

describe('SelectorModalidad', () => {
  it('con tienda-mayor-online=false solo ofrece unidad, aunque haya precio mayorista', () => {
    render(<SelectorHarness precioMayor={3000} cantcaja={6} />);
    expect(screen.getByText(formatCLP(500))).toBeInTheDocument();
    expect(screen.getByText(/stock: 20/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^caja/i })).not.toBeInTheDocument();
    expect(screen.queryByText(formatCLP(3000))).not.toBeInTheDocument();
    expect(screen.getByTestId('sel').textContent).toBe('unidad');
  });
});

const PRODUCTO = {
  producto_id: 1,
  codigo: 'A',
  detalle: 'Producto A',
  precio: 500,
  precio_mayor: 3000 as number | null,
  cantcaja: 6,
  stock: 20,
  umed: 'UND',
};

describe('BotonAgregarPedido — solo unidad en tienda', () => {
  it('no ofrece caja y agrega siempre unidad con precio unidad', () => {
    render(
      <CarritoProvider origen="productos">
        <Seed contacto />
        <BotonAgregarPedido item={PRODUCTO} />
        <Probe />
      </CarritoProvider>
    );

    expect(screen.queryByRole('button', { name: /^caja/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /agregar al pedido/i }));
    expect(screen.getByTestId('item-unidad').textContent).toBe('1:500');
    expect(screen.queryByTestId('item-caja')).not.toBeInTheDocument();
  });

  it('sin precio_mayor sigue agregando unidad', () => {
    render(
      <CarritoProvider origen="productos">
        <Seed contacto />
        <BotonAgregarPedido item={{ ...PRODUCTO, precio_mayor: null }} />
        <Probe />
      </CarritoProvider>
    );

    expect(screen.queryByRole('button', { name: /^caja/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /agregar al pedido/i }));
    expect(screen.getByTestId('item-unidad').textContent).toBe('1:500');
  });

  it('sin contacto abre el gate y no agrega hasta confirmar (sigue vigente)', async () => {
    render(
      <CarritoProvider origen="productos">
        <BotonAgregarPedido item={PRODUCTO} />
        <Probe />
      </CarritoProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /agregar al pedido/i }));
    await waitFor(() => expect(screen.getByText(/a qué nombre armamos el pedido/i)).toBeInTheDocument());
    expect(screen.getByTestId('total').textContent).toBe('0');
  });
});

describe('Páginas públicas — wiring de precio_mayor y stock', () => {
  const productoPagina = {
    codigo: 'A',
    id: 1,
    detalle: 'Producto A',
    imagen_url: null,
    cantcaja: 6,
    umed: 'UND',
    precio: 500,
    precio_mayor: 3000 as number | null,
    saldo: 20,
    es_nuevo: false,
  };

  it('productos muestra unidad y stock sin precio mayorista', () => {
    render(<ProductosPublicos productos={[productoPagina]} empresaSlug="demo" />);
    const selector = within(screen.getByRole('group', { name: /modalidad de compra/i }));
    expect(selector.getByText(formatCLP(500))).toBeInTheDocument();
    expect(selector.getByText(/stock: 20/i)).toBeInTheDocument();
    expect(selector.queryByText(formatCLP(3000))).not.toBeInTheDocument();
  });

  it('catálogo usa el precio de catálogo para unidad y no ofrece caja', () => {
    const data = {
      titulo: 'Catálogo',
      descripcion: null,
      mostrar_precio: true,
      mostrar_stock: true,
      empresa_slug: 'demo',
      productos: [{ ...productoPagina, precio_catalogo: 900 }],
    };
    render(<PublicCatalogoClient data={data} slug="demo" />);
    const selector = within(screen.getByRole('group', { name: /modalidad de compra/i }));
    expect(selector.getByText(formatCLP(900))).toBeInTheDocument();
    expect(selector.queryByText(formatCLP(3000))).not.toBeInTheDocument();
  });
});
