/** Fase B — N08a: detalle, mayor y stock en la tarjeta de tienda.
 * `mostrarStock` omitido = tienda; `false` explícito = catálogo oculta stock. */
import { render, screen } from '@testing-library/react';
import { TarjetaProductoTienda } from '@/components/TarjetaProductoTienda';

jest.mock('@/config/feature-flags.json', () =>
  require('@/__tests__/helpers/mockFlags').mockFlags({
    'tienda-medios-compra': true,
    'tienda-mayor-online': true,
  }),
);
jest.mock('@/components/BotonAgregarPedido', () => ({
  BotonAgregarPedido: () => null,
}));

const flags = jest.requireMock('@/config/feature-flags.json') as Record<string, boolean>;

const producto = (over: Record<string, unknown> = {}) => ({
  id: 118,
  codigo: '1055',
  detalle: 'Gallinita',
  imagen_url: null,
  es_nuevo: false,
  precio: 1500,
  precio_mayor: 1200,
  minimo_mayor: 6,
  saldo: 20,
  ...over,
});

beforeEach(() => {
  flags['tienda-medios-compra'] = true;
  flags['tienda-mayor-online'] = true;
});

describe('TarjetaProductoTienda — precios y stock (N08a)', () => {
  test('muestra detalle, mayor con mínimo y stock al omitir mostrarStock', () => {
    render(<TarjetaProductoTienda producto={producto()} />);
    expect(screen.getByText(/precio detalle/i)).toHaveTextContent('$1.500');
    expect(screen.getByText(/precio mayor/i)).toHaveTextContent(/\$1\.200/);
    expect(screen.getByText(/desde 6 unidades/i)).toBeInTheDocument();
    expect(screen.getByText(/stock disponible: 20 unidades/i)).toBeInTheDocument();
  });

  test('mostrarStock={false} explícito (catálogo) oculta el stock', () => {
    render(<TarjetaProductoTienda producto={producto()} mostrarStock={false} />);
    expect(screen.queryByText(/stock disponible/i)).not.toBeInTheDocument();
    expect(screen.getByText(/precio mayor/i)).toBeInTheDocument();
  });

  test('stock bajo el mínimo no ofrece precio mayor', () => {
    render(<TarjetaProductoTienda producto={producto({ saldo: 5 })} />);
    expect(screen.getByText(/precio detalle/i)).toBeInTheDocument();
    expect(screen.queryByText(/precio mayor/i)).not.toBeInTheDocument();
  });

  test('flag tienda-medios-compra apagado conserva la tarjeta anterior', () => {
    flags['tienda-medios-compra'] = false;
    render(<TarjetaProductoTienda producto={producto()} />);
    expect(screen.getByTestId('precio-menor')).toHaveTextContent('$1.500');
    expect(screen.queryByText(/precio mayor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/stock disponible/i)).not.toBeInTheDocument();
  });
});
