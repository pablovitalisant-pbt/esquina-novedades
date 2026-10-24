/**
 * Fase B — Slice C1: rebranding listo para enchufar.
 *
 * MarcaLogo: <img> cuando hay logo, wordmark de texto cuando no.
 * RedesSociales: URL vacía no se renderiza; con URL, enlace seguro (_blank + noopener).
 * manifest.ts: nombre/theme-color/iconos salen de EMPRESA.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MarcaLogo } from '@/components/MarcaLogo';
import { RedesSociales } from '@/components/RedesSociales';
import { EMPRESA } from '@/lib/empresa';
import manifest from '@/app/manifest';

describe('MarcaLogo', () => {
  test('con logo renderiza <img> con alt accesible', () => {
    render(<MarcaLogo logo="/marca/logo.png" />);
    const img = screen.getByRole('img', { name: EMPRESA.nombre });
    expect(img).toHaveAttribute('src', '/marca/logo.png');
  });

  test('sin logo cae al wordmark de texto actual', () => {
    render(<MarcaLogo logo={null} />);
    expect(screen.getByText(EMPRESA.nombre)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('RedesSociales', () => {
  test('todas vacías no renderizan nada', () => {
    const { container } = render(
      <RedesSociales redes={{ facebook: '', instagram: '', tiktok: '' }} />,
    );
    expect(container.innerHTML).toBe('');
  });

  test('solo las redes con URL se renderizan, con rel noopener', () => {
    render(
      <RedesSociales
        redes={{ facebook: 'https://facebook.com/x', instagram: '', tiktok: 'https://tiktok.com/@x' }}
      />,
    );
    const fb = screen.getByRole('link', { name: 'Facebook' });
    expect(fb).toHaveAttribute('href', 'https://facebook.com/x');
    expect(fb).toHaveAttribute('target', '_blank');
    expect(fb).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('link', { name: 'Instagram' })).not.toBeInTheDocument();
  });
});

describe('manifest', () => {
  test('nombre, theme-color e iconos vienen de EMPRESA', () => {
    const m = manifest();
    expect(m.name).toBe(EMPRESA.nombre);
    expect(m.theme_color).toBe(EMPRESA.colores.primario);
    expect((m.icons ?? []).map((i) => [i.src, i.purpose])).toEqual([
      ['/marca/icon-192.png', 'any'],
      ['/marca/icon-192.png', 'maskable'],
      ['/marca/icon-512.png', 'any'],
      ['/marca/icon-512.png', 'maskable'],
    ]);
  });
});
