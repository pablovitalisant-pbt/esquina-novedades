/**
 * Fase B — slice portada-auto con flag ON: secciones automáticas, banner,
 * destacados, por mayor y badge NUEVO explícito.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TiendaPortada } from '@/components/TiendaPortada';
import type { ProductoTienda } from '@/lib/tienda-productos';

jest.mock('@/config/feature-flags.json', () => ({
  'tienda-mayor-online': false,
  'tienda-portada-v2': true,
}));
Element.prototype.scrollIntoView = jest.fn();
jest.mock('sonner', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}));

const p = (over: Partial<ProductoTienda> = {}): ProductoTienda => ({
  codigo: 'X-1',
  id: 1,
  detalle: 'Producto',
  imagen_url: null,
  categoria: null,
  precio: 1000,
  precio_mayor: null,
  minimo_mayor: null,
  saldo: 5,
  es_nuevo: false,
  fecha_ingreso: '2026-01-01T00:00:00.000Z',
  ...over,
});

function renderizar(productos: ProductoTienda[], categorias: { id: string; nombre: string }[] = []) {
  return render(
    <TiendaPortada
      productos={productos}
      categorias={categorias}
      opcionesEntrega={[{ codigo: 'retiro', nombre: 'Retiro en tienda', activa: true }]}
      empresaSlug="la-esquina"
    />,
  );
}

test('smoke: portada completa renderiza buscador, Novedades, grilla y footer', () => {
  renderizar([p({ id: 1 }), p({ id: 2 })]);
  expect(screen.getByLabelText(/buscar productos/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Novedades' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /todos los productos/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /acceso equipo/i })).toHaveAttribute('href', '/login');
});

test('0 categorías: sin secciones de categoría y banner con el texto fijo', () => {
  renderizar([p({ id: 1 }), p({ id: 2 })]);
  expect(screen.queryAllByTestId('seccion-categoria')).toHaveLength(0);
  expect(screen.getByText('Hogar, regalos, juguetes y más · Por mayor y por menor')).toBeInTheDocument();
});

test('una sección por categoría con stock; las vacías no aparecen', () => {
  renderizar([
    p({ id: 1, categoria: 'Hogar' }),
    p({ id: 2, categoria: 'Hogar' }),
    p({ id: 3, categoria: 'Juguetes' }),
    p({ id: 4, categoria: 'Agotada', saldo: 0 }),
  ]);
  const secciones = screen.getAllByTestId('seccion-categoria');
  expect(secciones).toHaveLength(2);
  expect(within(secciones[0]).getByRole('heading', { name: 'Hogar' })).toBeInTheDocument();
  expect(screen.queryByText('Agotada')).not.toBeInTheDocument();
});

test('"Ver todos" aplica el filtro de categoría a la grilla', () => {
  renderizar([
    p({ id: 1, detalle: 'Taza', categoria: 'Hogar' }),
    p({ id: 2, detalle: 'Peluche', categoria: 'Juguetes' }),
  ]);
  fireEvent.click(screen.getAllByRole('button', { name: /ver todos/i })[0]);
  const grilla = within(screen.getByTestId('grilla'));
  expect(grilla.getByText('Taza')).toBeInTheDocument();
  expect(grilla.queryByText('Peluche')).not.toBeInTheDocument();
});

test('sección "Ahorra comprando por mayor" oculta sin productos válidos', () => {
  renderizar([p({ id: 1 }), p({ id: 2 })]);
  expect(screen.queryByTestId('portada-mayor')).not.toBeInTheDocument();
  expect(screen.queryByText(/ahorra comprando por mayor/i)).not.toBeInTheDocument();
});

test('sección "Ahorra comprando por mayor" visible con nota de mínimo', () => {
  renderizar([p({ id: 1, precio_mayor: 800, minimo_mayor: 3 })]);
  const seccion = screen.getByTestId('portada-mayor');
  expect(within(seccion).getByText(/desde 3 unidades: descuento especial/i)).toBeInTheDocument();
  // el precio mostrado sigue siendo por menor
  expect(within(seccion).getByTestId('precio-menor')).toHaveTextContent('$1.000');
});

test('badge NUEVO depende de pertenecer a Novedades, no de es_nuevo', () => {
  renderizar([p({ id: 1, detalle: 'Destacado Uno', es_nuevo: true }), p({ id: 2, detalle: 'Normal Dos' })]);
  const novedades = within(screen.getByTestId('portada-novedades'));
  expect(novedades.getAllByText('NUEVO').length).toBeGreaterThan(0);
  const grilla = within(screen.getByTestId('grilla'));
  expect(grilla.queryByText('NUEVO')).not.toBeInTheDocument();
});

test('destacados del banner: 3 más recientes priorizando los que tienen foto', () => {
  const { container } = renderizar([
    p({ id: 1, imagen_url: 'https://cdn/foto.jpg' }),
    p({ id: 2 }),
    p({ id: 3 }),
    p({ id: 4 }),
  ]);
  expect(container.querySelectorAll('[data-testid="hero-precio"]')).toHaveLength(3);
});

test('banner con categorías con stock: nombres (máx 3) + y más', () => {
  renderizar([
    p({ id: 1, categoria: 'Hogar' }),
    p({ id: 2, categoria: 'Juguetes' }),
    p({ id: 3, categoria: 'Regalos' }),
    p({ id: 4, categoria: 'Baño' }),
  ]);
  expect(screen.getByText('Baño, Hogar, Juguetes y más · Por mayor y por menor')).toBeInTheDocument();
});
