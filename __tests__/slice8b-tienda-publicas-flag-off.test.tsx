/**
 * Fase B — Slice 8b: con `tienda-portada-v2` OFF las páginas públicas
 * mantienen el comportamiento anterior (/productos no redirige, catálogo viejo).
 */
import { render, screen } from '@testing-library/react';
import { ProductosPublicos } from '@/app/productos/client_page';
import { PublicCatalogoClient } from '@/app/catalogo/[slug]/client_page';

jest.mock('@/config/feature-flags.json', () => ({ 'tienda-portada-v2': false }));
jest.mock('sonner', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}));

const mockPermanentRedirect = jest.fn();
jest.mock('next/navigation', () => ({
  permanentRedirect: (...args: unknown[]) => mockPermanentRedirect(...args),
  redirect: jest.fn(),
  notFound: jest.fn(),
}));

const mockGetProductosTienda = jest.fn();
jest.mock('@/lib/tienda-productos', () => ({
  getProductosTienda: (...args: unknown[]) => mockGetProductosTienda(...args),
}));

describe('flag OFF', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProductosTienda.mockResolvedValue({ productos: [], empresaSlug: 'la-esquina' });
  });

  test('/productos NO redirige y renderiza ProductosPublicos', async () => {
    const ProductosPage = (await import('@/app/productos/page')).default;
    const el = await ProductosPage();
    expect(mockPermanentRedirect).not.toHaveBeenCalled();
    expect(el.type).toBe(ProductosPublicos);
  });

  test('catálogo mantiene el diseño anterior (sin buscador de tienda)', () => {
    render(
      <PublicCatalogoClient
        data={{
          titulo: 'Catálogo Escolar',
          descripcion: null,
          empresa_slug: 'la-esquina',
          mostrar_precio: true,
          productos: [
            { id: 1, codigo: 'A-1', detalle: 'Cuaderno', imagen_url: null, es_nuevo: false, saldo: 1, cantcaja: 1, umed: 'UN', precio_catalogo: 1000 },
          ],
        }}
        slug="escolar"
      />,
    );
    expect(screen.queryByLabelText(/buscar productos/i)).not.toBeInTheDocument();
  });
});
