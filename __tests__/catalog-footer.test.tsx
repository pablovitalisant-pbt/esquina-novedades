/**
 * @jest-environment jsdom
 *
 * Fase B — Slice: Footer CTA en catálogos públicos.
 * Ambos client_pages (catálogo por slug y /productos) deben renderizar el
 * bloque CTA hacia serviciosdigitalespbt.site como ÚNICO enlace de footer.
 * Contrato:
 *   - 1 solo <a> por página, a https://www.serviciosdigitalespbt.site/,
 *     con target="_blank" rel="noopener noreferrer".
 *   - Texto completo de las dos líneas presente.
 *   - No hay footer de marca PBT/WhatsApp.
 */

import { render, screen } from '@testing-library/react';
import { PublicCatalogoClient } from '@/app/catalogo/[slug]/client_page';
import { ProductosPublicos } from '@/app/productos/client_page';

// BUG-004: el CTA de footer es del diseño anterior; fijar el flag, no leer el real.
jest.mock('@/config/feature-flags.json', () => ({ 'tienda-portada-v2': false }));

jest.mock('@/components/ImageWithFallback', () => ({
  ImageWithFallback: () => <div data-testid="image-fallback" />,
}));

jest.mock('@/lib/utils', () => ({
  ...jest.requireActual('@/lib/utils'),
  formatCLP: (value: number) => String(value),
}));

const CATALOGO_DATA = {
  titulo: 'Catálogo Demo',
  descripcion: '',
  empresa_slug: 'demo',
  mostrar_precio: false,
  productos: [],
};

const PRODUCTOS_PROPS = { productos: [], empresaSlug: 'demo' };

function assertFooter(superficie: string) {
  const links = screen.getAllByRole('link');
  // Un único enlace de footer al CTA; cero links a wa.me (footer de marca eliminado).
  // No se cuenta el total de links: la página tiene navegación legítima (ej. "Volver").
  const ctas = links.filter((l) => l.getAttribute('href') === 'https://www.serviciosdigitalespbt.site/');
  const marcas = links.filter((l) => l.getAttribute('href')?.includes('wa.me'));

  expect(ctas.length).toBe(1);
  expect(marcas.length).toBe(0);

  const cta = ctas[0];
  expect(cta).toHaveAttribute('target', '_blank');
  expect(cta).toHaveAttribute('rel', 'noopener noreferrer');

  // Texto completo de las dos líneas.
  expect(cta).toHaveTextContent('Tú buscas productos para vender. Servicios Digitales PBT construye herramientas para ayudarte a venderlos.');
  expect(cta).toHaveTextContent('Este catálogo es solo una de las cosas que podemos hacer por un negocio. ¿Qué podríamos hacer por el tuyo? Descúbrelo →');
}

describe('Footer CTA en catálogos públicos', () => {
  test('catálogo /[slug] renderiza un único CTA (sin footer de marca)', () => {
    render(<PublicCatalogoClient data={CATALOGO_DATA} slug="demo" />);
    assertFooter('catálogo');
  });

  test('/productos renderiza un único CTA (sin footer de marca)', () => {
    render(<ProductosPublicos {...PRODUCTOS_PROPS} />);
    assertFooter('/productos');
  });
});
