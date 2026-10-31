/**
 * Fase B — Slice 8a: portada de la tienda (flag tienda-portada-v2).
 * Tests que intentan romper la portada: buscador, categorías, orden, stock,
 * placeholders, beneficios desde opciones_entrega y footer.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TiendaPortada } from '@/components/TiendaPortada';
import type { ProductoTienda } from '@/lib/tienda-productos';

jest.mock('@/config/feature-flags.json', () => ({
  'tienda-portada-v2': true,
  'tienda-mayor-online': true,
}));
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
  producto({ codigo: 'B-2', id: 2, detalle: 'Peluche Osito', precio: 5000, es_nuevo: false, categoria: 'Juguetes' }),
  producto({ codigo: 'C-3', id: 3, detalle: 'Vela Aromática', precio: 3000, es_nuevo: true, categoria: 'Hogar' }),
];

const CATEGORIAS = [
  { id: 'c1', nombre: 'Hogar' },
  { id: 'c2', nombre: 'Juguetes' },
];

const OPCIONES = [
  { codigo: 'retiro', nombre: 'Retiro en tienda', activa: true },
  { codigo: 'delivery_iquique', nombre: 'Delivery Iquique', activa: true },
  { codigo: 'envio_arica', nombre: 'Envío a Arica', activa: false },
];

function renderizar(over: Partial<{ productos: ProductoTienda[]; categorias: typeof CATEGORIAS; opciones: typeof OPCIONES }> = {}) {
  return render(
    <TiendaPortada
      productos={over.productos ?? PRODUCTOS}
      categorias={over.categorias ?? CATEGORIAS}
      opcionesEntrega={over.opciones ?? OPCIONES}
      empresaSlug="la-esquina"
    />,
  );
}

function buscar(texto: string) {
  fireEvent.change(screen.getByLabelText(/buscar productos/i), { target: { value: texto } });
}

describe('estructura de la portada', () => {
  test('muestra beneficios, buscador, novedades, grilla y footer', () => {
    renderizar();
    expect(screen.getByText('Pago seguro con Mercado Pago')).toBeInTheDocument();
    expect(screen.getByText('Precios por mayor y por menor')).toBeInTheDocument();
    expect(screen.getByLabelText(/buscar productos/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Novedades' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /todos los productos/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /acceso equipo/i })).toHaveAttribute('href', '/login');
  });

  test('los beneficios de entrega salen de opciones_entrega activas', () => {
    renderizar();
    expect(screen.getByText(/Delivery Iquique/)).toBeInTheDocument();
    expect(screen.queryByText(/Envío a Arica/)).not.toBeInTheDocument();
  });

  test('sin categorías no se muestra la barra', () => {
    renderizar({ categorias: [] });
    expect(screen.queryByTestId('barra-categorias')).not.toBeInTheDocument();
  });
});

describe('buscador', () => {
  test('filtra por nombre sin distinguir mayúsculas ni tildes', () => {
    renderizar();
    buscar('MAGICA');
    const grilla = within(screen.getByTestId('grilla'));
    expect(grilla.getByText('Taza Mágica')).toBeInTheDocument();
    expect(grilla.queryByText('Peluche Osito')).not.toBeInTheDocument();
  });

  test('filtra por código', () => {
    renderizar();
    buscar('b-2');
    const grilla = within(screen.getByTestId('grilla'));
    expect(grilla.getByText('Peluche Osito')).toBeInTheDocument();
    expect(grilla.queryByText('Taza Mágica')).not.toBeInTheDocument();
  });

  test('sin coincidencias muestra estado vacío y contador en 0', () => {
    renderizar();
    buscar('zzzz');
    expect(screen.getByText(/no encontramos productos/i)).toBeInTheDocument();
    expect(screen.getByTestId('resultados')).toHaveTextContent('0');
  });
});

describe('categorías y orden', () => {
  test('clic en categoría filtra la grilla', () => {
    renderizar();
    fireEvent.click(within(screen.getByTestId('barra-categorias')).getByRole('button', { name: 'Juguetes' }));
    const grilla = within(screen.getByTestId('grilla'));
    expect(grilla.getByText('Peluche Osito')).toBeInTheDocument();
    expect(grilla.queryByText('Taza Mágica')).not.toBeInTheDocument();
  });

  test('ordena por menor y mayor precio', () => {
    renderizar();
    const selector = screen.getByLabelText(/ordenar productos/i);

    fireEvent.change(selector, { target: { value: 'menor' } });
    let items = screen.getAllByTestId('grilla-item');
    expect(items[0]).toHaveTextContent('Taza Mágica');

    fireEvent.change(selector, { target: { value: 'mayor' } });
    items = screen.getAllByTestId('grilla-item');
    expect(items[0]).toHaveTextContent('Peluche Osito');
  });

  test('producto sin stock no aparece', () => {
    renderizar({ productos: [...PRODUCTOS, producto({ codigo: 'Z-9', id: 9, detalle: 'Agotado Total', saldo: 0 })] });
    expect(screen.queryByText('Agotado Total')).not.toBeInTheDocument();
  });
});

describe('tarjeta de producto', () => {
  test('sin imagen usa placeholder de marca con el código', () => {
    renderizar({ productos: [PRODUCTOS[0]] });
    expect(screen.getAllByTestId('placeholder-producto').length).toBeGreaterThan(0);
  });

  test('nunca muestra precio por mayor ni mínimo', () => {
    renderizar({ productos: [PRODUCTOS[0]] });
    const items = screen.getAllByTestId('grilla-item');
    expect(items[0].textContent).not.toMatch(/mayor/i);
    expect(screen.getAllByTestId('precio-menor')[0]).toHaveTextContent('$1.000');
  });
});

describe('footer y sesión', () => {
  test('muestra medios de pago y contacto', () => {
    renderizar();
    expect(screen.getAllByText(/Mercado Pago/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Avenida Aeropuerto 2860/).length).toBeGreaterThan(0);
    expect(screen.getByText(/11:00 a 20:00/)).toBeInTheDocument();
  });
});
