/**
 * Slice 4c (reemplaza 7c): la tienda solo vende por unidad; el descuento por
 * mayor se revela en el checkout. Wiring de páginas con precio_mayor/minimo_mayor.
 */
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CarritoProvider, useCarrito, ItemCarrito } from '@/contexts/CarritoContext';
import { BotonAgregarPedido } from '@/components/BotonAgregarPedido';
import { TarjetaProductoTienda } from '@/components/TarjetaProductoTienda';
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

function Seed({ contacto }: { contacto?: boolean }) {
  const { setContacto } = useCarrito();
  useEffect(() => {
    if (contacto) setContacto({ nombre: 'Juana', telefono: '1' });
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
        <span key={i.producto_id} data-testid="item">
          {i.cantidad}:{i.precio}:{i.precio_mayor}:{i.minimo_mayor}
        </span>
      ))}
    </div>
  );
}

const PRODUCTO = {
  producto_id: 1,
  codigo: 'A',
  detalle: 'Producto A',
  precio: 500,
  precio_mayor: 3000 as number | null,
  minimo_mayor: 6 as number | null,
  stock: 20,
  umed: 'UND',
};

describe('BotonAgregarPedido — solo unidad en tienda', () => {
  it('agrega 1 unidad con precio detalle y conserva precio_mayor/minimo_mayor', () => {
    render(
      <CarritoProvider origen="productos">
        <Seed contacto />
        <BotonAgregarPedido item={PRODUCTO} />
        <Probe />
      </CarritoProvider>,
    );

    expect(screen.queryByRole('button', { name: /^caja/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/precio mayor/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /agregar al pedido/i }));
    expect(screen.getByTestId('item').textContent).toBe('1:500:3000:6');
  });

  it('sin precio_mayor sigue agregando unidad', () => {
    render(
      <CarritoProvider origen="productos">
        <Seed contacto />
        <BotonAgregarPedido item={{ ...PRODUCTO, precio_mayor: null, minimo_mayor: null }} />
        <Probe />
      </CarritoProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /agregar al pedido/i }));
    expect(screen.getByTestId('item').textContent).toBe('1:500::');
  });

  it('sin contacto abre el gate y no agrega hasta confirmar (sigue vigente)', async () => {
    render(
      <CarritoProvider origen="productos">
        <BotonAgregarPedido item={PRODUCTO} />
        <Probe />
      </CarritoProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /agregar al pedido/i }));
    await waitFor(() => expect(screen.getByText(/a qué nombre armamos el pedido/i)).toBeInTheDocument());
    expect(screen.getByTestId('total').textContent).toBe('0');
  });
});

describe('Páginas públicas — sin precio mayor ni mínimo visibles', () => {
  const productoPagina = {
    codigo: 'A',
    id: 1,
    detalle: 'Producto A',
    imagen_url: null,
    cantcaja: 6,
    umed: 'UND',
    precio: 500,
    precio_mayor: 3000 as number | null,
    minimo_mayor: 6 as number | null,
    saldo: 20,
    es_nuevo: false,
  };

  it('productos muestra el precio detalle y oculta el mayor', () => {
    render(
      <CarritoProvider origen="productos">
        <TarjetaProductoTienda producto={productoPagina} />
      </CarritoProvider>,
    );
    expect(screen.getByText(formatCLP(500))).toBeInTheDocument();
    expect(screen.queryByText(formatCLP(3000))).not.toBeInTheDocument();
    expect(screen.queryByText(/precio mayor/i)).not.toBeInTheDocument();
  });

  it('catálogo usa el precio de catálogo, stock en unidades y no muestra Packing', () => {
    const data = {
      titulo: 'Catálogo',
      descripcion: null,
      mostrar_precio: true,
      mostrar_stock: true,
      empresa_slug: 'demo',
      productos: [{ ...productoPagina, precio_catalogo: 900 }],
    };
    render(<PublicCatalogoClient data={data} slug="demo" />);
    expect(screen.getByText(formatCLP(900))).toBeInTheDocument();
    expect(screen.queryByText(formatCLP(3000))).not.toBeInTheDocument();
    expect(screen.getByText(/stock disponible: 20 unidades/i)).toBeInTheDocument();
    expect(screen.queryByText(/packing/i)).not.toBeInTheDocument();
  });
});
