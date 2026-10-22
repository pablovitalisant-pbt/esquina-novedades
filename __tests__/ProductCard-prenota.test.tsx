/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ProductCard } from '@/components/ProductCard';

jest.mock('@/components/AgregarANotaVentaModal', () => ({
  AgregarANotaVentaModal: () => null,
}));

const mockProducto = {
  id: 1,
  empresa_id: 2,
  codigo: 'ABC123',
  nroingreso: null,
  saldo: 10,
  umed: 'UN',
  cif: 100,
  costo: 80,
  prcventa: 150,
  prcminimo: 120,
  cantcaja: 6,
  pesocaja: 1,
  cubicaja: 1,
  detalle: 'Producto Test',
  imagen_url: null,
  es_nuevo: false,
  categoria: null,
  fecha_ingreso: new Date(),
  updated_at: new Date(),
};

describe('ProductCard — nota de venta', () => {
  test('muestra botón "Agregar a Nota de Venta" si rol !== bodeguero', () => {
    render(
      <ProductCard
        producto={mockProducto as any}
        empresaSlug="bazar-naty"
        empresaNombre="Bazar Naty"
        onClick={jest.fn()}
        rol="admin"
      />
    );

    expect(
      screen.getByRole('button', { name: /agregar a nota de venta/i })
    ).toBeInTheDocument();
  });

  test('no muestra botón si rol === bodeguero', () => {
    render(
      <ProductCard
        producto={mockProducto as any}
        empresaSlug="bazar-naty"
        empresaNombre="Bazar Naty"
        onClick={jest.fn()}
        rol="bodeguero"
      />
    );

    expect(
      screen.queryByRole('button', { name: /agregar a nota de venta/i })
    ).not.toBeInTheDocument();
  });
});
