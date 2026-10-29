/**
 * Fase B — Slice 8b: tienda pública unificada con `tienda-portada-v2` ON.
 * Franja de una línea, /productos redirige 308 y catálogo con las piezas de tienda.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FranjaBeneficios } from '@/components/tienda/FranjaBeneficios';
import { PublicCatalogoClient } from '@/app/catalogo/[slug]/client_page';

jest.mock('@/config/feature-flags.json', () => ({
  'tienda-portada-v2': true,
  'tienda-mayor-online': true,
}));
jest.mock('sonner', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}));

const mockPermanentRedirect = jest.fn((_destino: string) => {
  throw new Error('NEXT_REDIRECT');
});
jest.mock('next/navigation', () => ({
  permanentRedirect: (destino: string) => mockPermanentRedirect(destino),
  redirect: jest.fn(),
  notFound: jest.fn(),
}));

const mockGetProductosTienda = jest.fn();
jest.mock('@/lib/tienda-productos', () => ({
  getProductosTienda: (...args: unknown[]) => mockGetProductosTienda(...args),
}));

describe('franja de beneficios en móvil', () => {
  test('es una sola línea con scroll horizontal, sin envolver', () => {
    render(<FranjaBeneficios nombresEntrega="Delivery Iquique" />);
    const franja = screen.getByTestId('franja-beneficios');
    const clases = franja.className.split(/\s+/);
    expect(clases).toContain('whitespace-nowrap');
    expect(clases).toContain('overflow-x-auto');
    expect(clases).toContain('h-8');
    expect(clases).not.toContain('flex-wrap');
    expect(screen.getByText('Pago seguro con Mercado Pago')).toBeInTheDocument();
    expect(screen.getByText('Precios por mayor y por menor')).toBeInTheDocument();
  });
});

describe('/productos con flag ON', () => {
  test('redirige a "/" con 308', async () => {
    const ProductosPage = (await import('@/app/productos/page')).default;
    await expect(ProductosPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockPermanentRedirect).toHaveBeenCalledWith('/');
  });
});

const DATA = {
  titulo: 'Catálogo Escolar',
  descripcion: 'Los útiles del regreso a clases',
  empresa_slug: 'la-esquina',
  mostrar_precio: true,
  mostrar_stock: false,
  productos: [
    { id: 1, codigo: 'A-1', detalle: 'Cuaderno Mágico', imagen_url: null, es_nuevo: true, saldo: 4, cantcaja: 1, umed: 'UN', precio_catalogo: 1000, categoria: 'Útiles' },
    { id: 2, codigo: 'B-2', detalle: 'Mochila', imagen_url: null, es_nuevo: false, saldo: 2, cantcaja: 1, umed: 'UN', precio_catalogo: 9000, categoria: 'Mochilas' },
  ],
};

describe('catálogo público con flag ON', () => {
  test('usa el header de tienda, tarjetas de tienda y mismo footer', () => {
    render(<PublicCatalogoClient data={DATA} slug="escolar" />);

    expect(screen.getByLabelText(/buscar productos/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Catálogo Escolar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /acceso equipo/i })).toHaveAttribute('href', '/login');
    expect(screen.getAllByTestId('precio-menor').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /agregar al pedido/i }).length).toBeGreaterThan(0);
  });

  test('buscador y barra de categorías filtran el catálogo', () => {
    render(<PublicCatalogoClient data={DATA} slug="escolar" />);

    fireEvent.change(screen.getByLabelText(/buscar productos/i), { target: { value: 'MOCHILA' } });
    let grilla = within(screen.getByTestId('catalogo-grilla'));
    expect(grilla.getByText('Mochila')).toBeInTheDocument();
    expect(grilla.queryByText('Cuaderno Mágico')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/buscar productos/i), { target: { value: '' } });
    fireEvent.click(within(screen.getByTestId('barra-categorias')).getByRole('button', { name: 'Útiles' }));
    grilla = within(screen.getByTestId('catalogo-grilla'));
    expect(grilla.getByText('Cuaderno Mágico')).toBeInTheDocument();
    expect(grilla.queryByText('Mochila')).not.toBeInTheDocument();
  });

  test('mostrar_precio=false: sin precio y sin botón agregar', () => {
    render(<PublicCatalogoClient data={{ ...DATA, mostrar_precio: false }} slug="escolar" />);
    expect(screen.queryByTestId('precio-menor')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /agregar al pedido/i })).not.toBeInTheDocument();
    expect(screen.getByText('Cuaderno Mágico')).toBeInTheDocument();
  });
});
