/**
 * Fase B — slice portada-auto con flag OFF: render idéntico al actual.
 */
import { render, screen, within } from '@testing-library/react';
import { TiendaPortada } from '@/components/TiendaPortada';
import type { ProductoTienda } from '@/lib/tienda-productos';

jest.mock('@/config/feature-flags.json', () => ({
  'tienda-portada-auto': false,
  'tienda-mayor-online': false,
  'tienda-portada-v2': true,
}));
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

const PRODUCTOS = [
  p({ id: 1, detalle: 'Taza', categoria: 'Hogar', es_nuevo: true }),
  p({ id: 2, detalle: 'Peluche', categoria: 'Juguetes' }),
];

function renderizar() {
  return render(
    <TiendaPortada
      productos={PRODUCTOS}
      categorias={[{ id: 'c1', nombre: 'Hogar' }, { id: 'c2', nombre: 'Juguetes' }]}
      opcionesEntrega={[{ codigo: 'retiro', nombre: 'Retiro en tienda', activa: true }]}
      empresaSlug="la-esquina"
    />,
  );
}

test('flag OFF: sin secciones automáticas ni por mayor; banner y badge actuales', () => {
  renderizar();
  expect(screen.queryAllByTestId('seccion-categoria')).toHaveLength(0);
  expect(screen.queryByTestId('portada-mayor')).not.toBeInTheDocument();
  expect(screen.getByText('Hogar, regalos, juguetes y más · Por mayor y por menor')).toBeInTheDocument();
  const grilla = within(screen.getByTestId('grilla'));
  expect(grilla.getByText('NUEVO')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Novedades' })).toBeInTheDocument();
});
