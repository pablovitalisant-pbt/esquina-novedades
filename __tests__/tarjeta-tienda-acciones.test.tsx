/** Fase B — BUG-013 V02: cada acción de compra vive en su bloque de precio. */
import { render, screen, within } from '@testing-library/react';
import { CarritoProvider } from '@/contexts/CarritoContext';
import { TarjetaProductoTienda } from '@/components/TarjetaProductoTienda';

jest.mock('@/config/feature-flags.json', () =>
  require('@/__tests__/helpers/mockFlags').mockFlags({
    'tienda-medios-compra': true,
    'tienda-mayor-online': true,
  }),
);

const flags = jest.requireMock('@/config/feature-flags.json') as Record<string, boolean>;

const producto = (over: Record<string, unknown> = {}) => ({
  id: 118, codigo: '1055', detalle: 'Gallinita', imagen_url: null, es_nuevo: false,
  precio: 1500, precio_mayor: 1200, minimo_mayor: 6, saldo: 20, ...over,
});

const renderTarjeta = (props: Parameters<typeof TarjetaProductoTienda>[0]) =>
  render(<CarritoProvider origen="productos"><TarjetaProductoTienda {...props} /></CarritoProvider>);

beforeEach(() => {
  flags['tienda-medios-compra'] = true;
  flags['tienda-mayor-online'] = true;
});

describe('TarjetaProductoTienda — acciones por bloque (BUG-013)', () => {
  test('detalle y mayor: una sola acción dentro de su bloque', () => {
    renderTarjeta({ producto: producto() });
    const menor = screen.getByTestId('precio-menor');
    const mayor = screen.getByTestId('precio-mayor');
    expect(within(menor).getByRole('button', { name: 'Comprar al detalle' })).toBeInTheDocument();
    expect(within(mayor).getByRole('button', { name: 'Comprar por mayor' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(within(menor).queryByRole('button', { name: 'Comprar por mayor' })).toBeNull();
    expect(within(mayor).queryByRole('button', { name: 'Comprar al detalle' })).toBeNull();
  });

  test('stock 5 (< mínimo): solo detalle en su bloque', () => {
    renderTarjeta({ producto: producto({ saldo: 5 }) });
    expect(screen.queryByTestId('precio-mayor')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Comprar por mayor' })).toBeNull();
    expect(within(screen.getByTestId('precio-menor')).getByRole('button', { name: 'Comprar al detalle' })).toBeInTheDocument();
  });

  test('mostrarPrecio=false: sin botones', () => {
    renderTarjeta({ producto: producto(), mostrarPrecio: false });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  test('flag tienda-medios-compra apagado conserva "Agregar al pedido"', () => {
    flags['tienda-medios-compra'] = false;
    renderTarjeta({ producto: producto() });
    expect(screen.getByRole('button', { name: 'Agregar al pedido' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Comprar al detalle' })).toBeNull();
  });
});
