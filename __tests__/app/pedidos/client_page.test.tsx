/**
 * @jest-environment jsdom
 *
 * Fase B — Slice 7f: vista staff de pedidos muestra estado, modalidad,
 * subtotal, entrega, dirección, email y el total calculado en el servidor.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
  email_contacto: 'pablo@example.com',
  origen: 'productos',
  estado: 'pendiente_pago',
  created_at: '2026-08-17T20:10:00Z',
  entrega_codigo: 'delivery_iquique',
  entrega_costo: 3000,
  direccion_entrega: 'Av. Prat 123',
  total: 5000,
  items: [
    { codigo: '1055', detalle: 'gallinita', cantidad: 2, modalidad: 'caja', precio: 4, subtotal: 8, cantcaja: 30 },
    { codigo: '2000', detalle: 'pelota', cantidad: 1, modalidad: 'unidad', precio: 1992, subtotal: 1992, cantcaja: 6 },
  ],
};

function renderPage(data: any[] = [PEDIDO]) {
  (global.fetch as jest.Mock) = jest.fn(async () => ({
    ok: true,
    json: async () => ({ data }),
  }));
  render(<PedidosPage session={{}} />);
}

describe('PedidosPage — detalle del pedido (7f)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('muestra estado, email, entrega, dirección y total del servidor', async () => {
    renderPage();
    await screen.findByText('Pablo');
    fireEvent.click(screen.getByText('Pablo'));

    expect(screen.getByText('Pendiente de pago')).toBeInTheDocument();
    expect(screen.getByText(/pablo@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/Delivery Iquique/)).toBeInTheDocument();
    expect(screen.getByText(/Av\. Prat 123/)).toBeInTheDocument();
    // total viene del servidor (5000), no se recalcula de los ítems
    await screen.findByText('Total: $5.000');
  });

  it('muestra modalidad y subtotal por ítem', async () => {
    renderPage();
    await screen.findByText('Pablo');
    fireEvent.click(screen.getByText('Pablo'));

    expect(screen.getByText('2 cajas')).toBeInTheDocument();
    expect(screen.getByText('1 unidad')).toBeInTheDocument();
    expect(screen.getByText('$8')).toBeInTheDocument();
    expect(screen.getByText('$1.992')).toBeInTheDocument();
    expect(screen.getByText('Entrega: $3.000')).toBeInTheDocument();
  });
});
