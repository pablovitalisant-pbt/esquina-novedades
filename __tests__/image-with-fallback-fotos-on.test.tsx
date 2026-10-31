/**
 * Fase B — fotos-1 con flag ON: sin src no se pide una URL adivinada.
 */
import { render, screen } from '@testing-library/react';

jest.mock('@/config/feature-flags.json', () => ({ 'fotos-v1': true }));

import { ImageWithFallback } from '@/components/ImageWithFallback';

describe('ImageWithFallback — fotos-v1 ON', () => {
  it('sin src renderiza placeholder y no un <img> con url adivinada', () => {
    const { container } = render(
      <ImageWithFallback codigo="SIN-FOTO" empresaSlug="la-esquina" fill />
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('SIN-FOTO')).toBeInTheDocument();
  });

  it('con src aplica la transformacion de ancho pedida', () => {
    const { container } = render(
      <ImageWithFallback
        src="https://res.cloudinary.com/demo/image/upload/v1/productos/A.jpg"
        codigo="A"
        empresaSlug="la-esquina"
        ancho={400}
        fill
      />
    );

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('f_auto,q_auto,c_limit,w_400');
  });
});
