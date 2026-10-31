/**
 * Fase B — fotos-1 con flag OFF: se conserva el comportamiento actual
 * (url adivinada cuando no hay src).
 */
import { render } from '@testing-library/react';

jest.mock('@/config/feature-flags.json', () => ({ 'fotos-v1': false }));

import { ImageWithFallback } from '@/components/ImageWithFallback';

describe('ImageWithFallback — fotos-v1 OFF', () => {
  it('sin src sigue renderizando la url adivinada (comportamiento de hoy)', () => {
    const { container } = render(
      <ImageWithFallback codigo="SIN-FOTO" empresaSlug="la-esquina" fill />
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toContain('la-esquina/SIN-FOTO.jpeg');
  });
});
