/**
 * @jest-environment jsdom
 *
 * Fase B — sub-slice pedidos-pdf-ui: botones Imprimir PDF / Enviar por
 * WhatsApp en el pedido expandido de /pedidos (casos 15-18 del contrato).
 * Se mockea @/lib/pdf-pedido, no jspdf: la UI no conoce el generador.
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

jest.mock('@/config/feature-flags.json', () =>
  require('@/__tests__/helpers/mockFlags').mockFlags({ 'pedidos-pdf': false }),
);

const mockConstruir = jest.fn();
const mockNombre = jest.fn((..._a: any[]) => 'Pedido 67181656 - Pablo.pdf');
const mockDescargar = jest.fn();
const mockCompartir = jest.fn();
jest.mock('@/lib/pdf-pedido', () => ({
  construirPdfPedido: (...a: any[]) => mockConstruir(...a),
  nombreArchivoPedido: (...a: any[]) => mockNombre(...a),
  descargarPdf: (...a: any[]) => mockDescargar(...a),
  compartirPdfWhatsApp: (...a: any[]) => mockCompartir(...a),
}));

const flags = jest.requireMock('@/config/feature-flags.json') as Record<string, boolean>;

const PEDIDO = {
  id: '67181656-22d3-4a80-8f63-6efc18d3d45d',
  cliente: { id: 'c1', nombre: 'Pablo', telefono: '+56920948874' },
  email_contacto: 'pablo@example.com',
  origen: 'productos',
  estado: 'pendiente_pago',
  created_at: '2026-08-17T20:10:00Z',
  entrega_codigo: 'delivery_iquique',
  entrega_costo: 3000,
  direccion_entrega: 'Av. Prat 123',
  total: 5000,
  items: [{
    codigo: '1055', detalle: 'gallinita', cantidad: 2, modalidad: 'mayor',
    precio: 4, subtotal: 8, imagen_url: null,
  }],
};

function montar(data: any[] = [PEDIDO]) {
  (global.fetch as jest.Mock) = jest.fn(async () => ({
    ok: true,
    json: async () => ({ data }),
  }));
  render(<PedidosPage session={{}} />);
}

async function expandir(nombre = 'Pablo') {
  await screen.findByText(nombre);
  fireEvent.click(screen.getByText(nombre));
}

const botonPdf = () => screen.queryByRole('button', { name: /Imprimir PDF|Generando PDF/ });
const botonWa = () => screen.queryByRole('button', { name: /Enviar por WhatsApp|Enviando/ });

beforeEach(() => {
  jest.clearAllMocks();
  flags['pedidos-pdf'] = false;
  mockNombre.mockReturnValue('Pedido 67181656 - Pablo.pdf');
});

describe('PedidosPage — botones PDF del pedido', () => {
  it('15. flag apagado: no hay botones PDF ni WhatsApp', async () => {
    montar();
    await expandir();
    expect(botonPdf()).toBeNull();
    expect(botonWa()).toBeNull();
  });

  it('16. flag activo: ambos botones visibles en cualquier estado', async () => {
    flags['pedidos-pdf'] = true;
    montar([{ ...PEDIDO, estado: 'expirado' }]);
    await expandir();
    expect(botonPdf()).toBeInTheDocument();
    expect(botonWa()).toBeInTheDocument();
  });

  it('17. pedido sin items: botones deshabilitados', async () => {
    flags['pedidos-pdf'] = true;
    montar([{ ...PEDIDO, items: [] }]);
    await expandir();
    expect(botonPdf()).toBeDisabled();
    expect(botonWa()).toBeDisabled();
  });

  it('18. Imprimir PDF: muestra "Generando PDF...", deshabilita y descarga', async () => {
    flags['pedidos-pdf'] = true;
    let resolver!: (doc: unknown) => void;
    mockConstruir.mockReturnValue(new Promise((r) => { resolver = r; }));
    montar();
    await expandir();

    fireEvent.click(botonPdf()!);
    await screen.findByText('Generando PDF...');
    expect(botonPdf()).toBeDisabled();
    expect(mockConstruir).toHaveBeenCalledTimes(1);
    expect(mockConstruir).toHaveBeenCalledWith(PEDIDO);

    resolver({ save: jest.fn() });
    await waitFor(() => expect(mockDescargar).toHaveBeenCalledWith(
      expect.anything(), 'Pedido 67181656 - Pablo.pdf',
    ));
    expect(botonPdf()).toBeInTheDocument(); // vuelve a "Imprimir PDF"
  });

  it('18b. Enviar por WhatsApp: "Enviando...", comparte y no descarga', async () => {
    flags['pedidos-pdf'] = true;
    let resolver!: (doc: unknown) => void;
    mockConstruir.mockReturnValue(new Promise((r) => { resolver = r; }));
    montar();
    await expandir();

    fireEvent.click(botonWa()!);
    await screen.findByText('Enviando...');
    expect(botonWa()).toBeDisabled();

    resolver({ output: jest.fn() });
    await waitFor(() => expect(mockCompartir).toHaveBeenCalledWith(
      expect.anything(),
      'Pedido 67181656 - Pablo.pdf',
      expect.stringContaining('Pedido 67181656'),
    ));
    expect(mockDescargar).not.toHaveBeenCalled();
  });

  it('18c. si el generador devuelve null no descarga ni comparte', async () => {
    flags['pedidos-pdf'] = true;
    mockConstruir.mockResolvedValue(null);
    montar();
    await expandir();
    fireEvent.click(botonPdf()!);
    await waitFor(() => expect(mockConstruir).toHaveBeenCalled());
    expect(mockDescargar).not.toHaveBeenCalled();
    expect(botonPdf()).toBeInTheDocument();
  });
});
