/**
 * @jest-environment jsdom
 *
 * Fase B — Slice "Total de la compra": vista staff de pedidos.
 * Smoke: el detalle expandido muestra el total (Σ precio×cantcaja×cantidad).
 * Caso de riesgo: item sin precio_referencia se excluye del total y muestra el
 * indicador "(algunos productos sin precio no incluidos)".
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PedidosPage } from '@/app/(app)/pedidos/client_page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

const PEDIDO = {
  id: 'p1',
  cliente: { id: 'c1', nombre: 'Pablo', telefono: '+56920948874' },
  origen: 'productos',
  estado: 'pendiente',
  created_at: '2026-08-17T20:10:00Z',
  items: [
    { codigo: '1055', detalle: 'gallinita', cantidad: 2, precio_referencia: 4, cantcaja: 30 },
  ],
};

function renderPage(data: any[] = [PEDIDO]) {
  (global.fetch as jest.Mock) = jest.fn(async () => ({
    ok: true,
    json: async () => ({ data }),
  }));
  render(<PedidosPage session={{}} />);
}

describe('PedidosPage — total de la compra en el detalle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('muestra el total del pedido en el detalle expandido (formatUSD)', async () => {
    renderPage();

    // esperar carga y abrir el detalle
    await screen.findByText('Pablo');
    fireEvent.click(screen.getByText('Pablo'));

    // total = 4 × 30 × 2 = 240 → línea "Total: $240.00"
    await screen.findByText('Total: $240.00');
  });

  it('item sin precio_referencia se excluye del total y muestra el indicador', async () => {
    const conSinPrecio = {
      ...PEDIDO,
      items: [
        { codigo: '1055', detalle: 'gallinita', cantidad: 2, precio_referencia: 4, cantcaja: 30 },
        { codigo: '999', detalle: 'sin precio', cantidad: 1, precio_referencia: null, cantcaja: 6 },
      ],
    };
    renderPage([conSinPrecio]);

    await screen.findByText('Pablo');
    fireEvent.click(screen.getByText('Pablo'));

    // solo cuenta el item con precio: 4 × 30 × 2 = 240
    await screen.findByText('Total: $240.00');
    expect(screen.getByText(/algunos productos sin precio no incluidos/i)).toBeInTheDocument();
  });
});
