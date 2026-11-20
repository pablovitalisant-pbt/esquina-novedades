/**
 * BUG-015: el buscador de la tienda filtraba la grilla, pero la portada
 * (hero, Novedades, secciones por categoría, por mayor) seguía encima y el
 * cliente no veía resultados. Al buscar, la portada se oculta y la grilla
 * queda al frente con el título de resultados.
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
  producto({ codigo: 'A-1', id: 1, detalle: 'Taza Mágica', precio: 1000, precio_mayor: 800, minimo_mayor: 6, es_nuevo: true, categoria: 'Hogar' }),
  producto({ codigo: 'B-2', id: 2, detalle: 'Peluche Osito', precio: 5000, categoria: 'Juguetes' }),
  producto({ codigo: 'C-3', id: 3, detalle: 'Vaso Térmico', precio: 3000, categoria: 'Hogar' }),
  producto({ codigo: 'D-4', id: 4, detalle: 'Vela Aromática', precio: 2000, categoria: 'Hogar' }),
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

function buscar(texto: string) {
  fireEvent.change(screen.getByLabelText(/buscar productos/i), { target: { value: texto } });
}

beforeEach(() => {
  window.scrollTo = jest.fn();
});

describe('BUG-015: la búsqueda pone los resultados al frente', () => {
  test('buscar por detalle oculta la portada y deja solo las coincidencias', () => {
    renderizar();
    buscar('vaso');

    expect(screen.queryByTestId('portada-novedades')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('seccion-categoria')).toHaveLength(0);
    expect(screen.queryByTestId('portada-mayor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hero-precio')).not.toBeInTheDocument();

    expect(screen.getByRole('heading', { name: /resultados para "vaso"/i })).toBeInTheDocument();
    const grilla = within(screen.getByTestId('grilla'));
    expect(grilla.getByText('Vaso Térmico')).toBeInTheDocument();
    expect(grilla.queryByText('Taza Mágica')).not.toBeInTheDocument();
    expect(grilla.queryByText('Peluche Osito')).not.toBeInTheDocument();
  });

  test('busca por código', () => {
    renderizar();
    buscar('b-2');

    expect(screen.queryByTestId('portada-novedades')).not.toBeInTheDocument();
    const grilla = within(screen.getByTestId('grilla'));
    expect(grilla.getByText('Peluche Osito')).toBeInTheDocument();
    expect(grilla.queryByText('Vaso Térmico')).not.toBeInTheDocument();
  });

  test('no distingue tildes ni mayúsculas', () => {
    renderizar();
    buscar('MÁGICA');

    const grilla = within(screen.getByTestId('grilla'));
    expect(grilla.getByText('Taza Mágica')).toBeInTheDocument();
    expect(grilla.queryByText('Vela Aromática')).not.toBeInTheDocument();
  });

  test('sin coincidencias: estado vacío y "Limpiar filtros" devuelve la portada', () => {
    renderizar();
    buscar('zzzz');

    expect(screen.getByText(/no encontramos productos/i)).toBeInTheDocument();
    expect(screen.queryByTestId('portada-novedades')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /limpiar filtros/i }));

    expect(screen.getByTestId('portada-novedades')).toBeInTheDocument();
    expect(screen.getAllByTestId('seccion-categoria').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /todos los productos/i })).toBeInTheDocument();
  });

  test('borrar el texto (vacío o solo espacios) muestra la portada completa', () => {
    renderizar();
    buscar('vaso');
    expect(screen.queryByTestId('portada-novedades')).not.toBeInTheDocument();

    buscar('');
    expect(screen.getByTestId('portada-novedades')).toBeInTheDocument();

    buscar('   ');
    expect(screen.getByTestId('portada-novedades')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /todos los productos/i })).toBeInTheDocument();
  });

  test('scrollTo se llama una sola vez al escribir varias letras seguidas', () => {
    renderizar();
    buscar('v');
    buscar('va');
    buscar('vas');
    buscar('vaso');

    expect(window.scrollTo).toHaveBeenCalledTimes(1);
  });
});
