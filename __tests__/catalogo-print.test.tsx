/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PublicCatalogoClient } from '@/app/catalogo/[slug]/client_page';

// BUG-004: este test valida la impresión del diseño anterior; fijar el flag.
jest.mock('@/config/feature-flags.json', () => ({ 'tienda-portada-v2': false }));

jest.mock('@/components/ImageWithFallback', () => ({
  ImageWithFallback: () => <div data-testid="image-fallback" />,
}));

jest.mock('@/lib/utils', () => ({
  ...jest.requireActual('@/lib/utils'),
  formatCLP: (value: number) => String(value),
}));

describe('PublicCatalogoClient print support', () => {
  beforeEach(() => {
    window.print = jest.fn();
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
    jest.useRealTimers();
  });

  const baseData = {
    titulo: 'Catalogo Demo',
    descripcion: 'Prueba',
    empresa_slug: 'demo',
    mostrar_precio: true,
  };

  test('imprime automaticamente si la URL contiene ?print=1', () => {
    jest.useFakeTimers();
    window.history.replaceState({}, '', '/catalogo?print=1');
    const data = {
      ...baseData,
      productos: [
        { id: 1, codigo: 'A1', detalle: 'Producto A', imagen_url: null, es_nuevo: false, cantcaja: 1, umed: 'UND', precio_catalogo: 100 },
      ],
    };

    render(<PublicCatalogoClient data={data} slug="demo" />);
    jest.advanceTimersByTime(900);

    expect(window.print).toHaveBeenCalled();
  });

  test('NO imprime si la URL no tiene ?print=1', () => {
    jest.useFakeTimers();
    window.history.replaceState({}, '', '/catalogo');
    const data = {
      ...baseData,
      productos: [
        { id: 1, codigo: 'A1', detalle: 'Producto A', imagen_url: null, es_nuevo: false, cantcaja: 1, umed: 'UND', precio_catalogo: 100 },
      ],
    };

    render(<PublicCatalogoClient data={data} slug="demo" />);
    jest.advanceTimersByTime(900);

    expect(window.print).not.toHaveBeenCalled();
  });

  test('Cada tarjeta de producto tiene clase print-page', () => {
    const data = {
      ...baseData,
      productos: [
        { id: 1, codigo: 'A1', detalle: 'Producto A', imagen_url: null, es_nuevo: false, cantcaja: 1, umed: 'UND', precio_catalogo: 100 },
        { id: 2, codigo: 'B2', detalle: 'Producto B', imagen_url: null, es_nuevo: false, cantcaja: 1, umed: 'UND', precio_catalogo: 200 },
        { id: 3, codigo: 'C3', detalle: 'Producto C', imagen_url: null, es_nuevo: false, cantcaja: 1, umed: 'UND', precio_catalogo: 300 },
      ],
    };

    const { container } = render(<PublicCatalogoClient data={data} slug="demo" />);

    expect(container.querySelectorAll('.print-page')).toHaveLength(3);
  });
});
