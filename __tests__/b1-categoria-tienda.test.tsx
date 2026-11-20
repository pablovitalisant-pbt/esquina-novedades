/**
 * B1: elegir una categoría en la barra de la tienda filtraba la grilla, pero
 * la portada seguía encima y la grilla quedaba a ~14.000 px. Mismo patrón que
 * BUG-015: con categoría elegida la portada se oculta y la grilla queda al
 * frente, con el nombre de la categoría como título.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TiendaPortada } from '@/components/TiendaPortada';
import type { ProductoTienda } from '@/lib/tienda-productos';

jest.mock('@/config/feature-flags.json', () =>
  require('@/__tests__/helpers/mockFlags').mockFlags({
    'tienda-portada-v2': true,
    'tienda-mayor-online': true,
  }),
);
jest.mock('sonner', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}));

const producto = (over: Partial<ProductoTienda>): ProductoTienda => ({
  codigo: 'X-1',
  id: 1,
  detalle: 'Producto',
  imagen_url: null,
  precio: 1000,
  precio_mayor: null,
  minimo_mayor: null,
  saldo: 5,
  es_nuevo: false,
  categoria: 'Hogar',
  fecha_ingreso: null,
  ...over,
});

const PRODUCTOS: ProductoTienda[] = [
  producto({ codigo: 'A-1', id: 1, detalle: 'Taza Mágica', categoria: 'Hogar' }),
  producto({ codigo: 'B-2', id: 2, detalle: 'Peluche Osito', categoria: 'Juguetes' }),
  producto({ codigo: 'C-3', id: 3, detalle: 'Vaso Térmico', categoria: 'Hogar' }),
];

const CATEGORIAS = [
  { id: 'c1', nombre: 'Hogar' },
  { id: 'c2', nombre: 'Juguetes' },
];

const OPCIONES = [{ codigo: 'retiro', nombre: 'Retiro en tienda', activa: true }];

function renderizar() {
  return render(
    <TiendaPortada productos={PRODUCTOS} categorias={CATEGORIAS} opcionesEntrega={OPCIONES} />,
  );
}

function elegirCategoria(nombre: string) {
  const barra = screen.getByTestId('barra-categorias');
  fireEvent.click(within(barra).getByRole('button', { name: nombre }));
}

beforeEach(() => {
  window.scrollTo = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

describe('B1: la categoría pone los resultados al frente', () => {
  test('elegir una categoría oculta la portada y muestra solo esa categoría', () => {
    renderizar();
    elegirCategoria('Hogar');

    expect(screen.queryByTestId('portada-novedades')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('seccion-categoria')).toHaveLength(0);
    expect(screen.queryByTestId('portada-mayor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hero-precio')).not.toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Hogar' })).toBeInTheDocument();
    const grilla = within(screen.getByTestId('grilla'));
    expect(grilla.getByText('Taza Mágica')).toBeInTheDocument();
    expect(grilla.getByText('Vaso Térmico')).toBeInTheDocument();
    expect(grilla.queryByText('Peluche Osito')).not.toBeInTheDocument();
  });

  test('"Todas" devuelve la portada completa', () => {
    renderizar();
    elegirCategoria('Hogar');
    elegirCategoria('Todas');

    expect(screen.getByTestId('portada-novedades')).toBeInTheDocument();
    expect(screen.getAllByTestId('seccion-categoria').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /todos los productos/i })).toBeInTheDocument();
  });

  test('categoría + búsqueda: el título incluye ambos', () => {
    renderizar();
    fireEvent.change(screen.getByLabelText(/buscar productos/i), { target: { value: 'vaso' } });
    elegirCategoria('Hogar');

    expect(
      screen.getByRole('heading', { name: /resultados para "vaso" en hogar/i }),
    ).toBeInTheDocument();
    const grilla = within(screen.getByTestId('grilla'));
    expect(grilla.getByText('Vaso Térmico')).toBeInTheDocument();
    expect(grilla.queryByText('Taza Mágica')).not.toBeInTheDocument();
  });

  test('scrollTo sube al filtrar y al cambiar de categoría ya filtrando', () => {
    renderizar();
    expect(window.scrollTo).not.toHaveBeenCalled();

    elegirCategoria('Hogar');
    expect(window.scrollTo).toHaveBeenCalledTimes(1);

    elegirCategoria('Juguetes');
    expect(window.scrollTo).toHaveBeenCalledTimes(2);

    elegirCategoria('Todas');
    expect(window.scrollTo).toHaveBeenCalledTimes(2);
  });

  test('"Ver todos" de una sección deja la grilla filtrada al frente', () => {
    renderizar();
    const seccion = screen.getByRole('heading', { name: 'Hogar' }).closest('section')!;
    fireEvent.click(within(seccion).getByRole('button', { name: /ver todos/i }));

    expect(screen.queryAllByTestId('seccion-categoria')).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'Hogar' })).toBeInTheDocument();
    const grilla = within(screen.getByTestId('grilla'));
    expect(grilla.getByText('Vaso Térmico')).toBeInTheDocument();
    expect(grilla.queryByText('Peluche Osito')).not.toBeInTheDocument();
  });
});
