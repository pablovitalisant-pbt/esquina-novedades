/**
 * FASE B — audit #2: el diálogo de detalle mostraba `detalle.fecha ||
 * detalle.created_at` y GET /api/notas-venta/[id] no trae `fecha`, así que se
 * veía el ISO crudo en UTC. Debe verse la fecha-hora chilena formateada.
 */
import { render, screen, cleanup } from '@testing-library/react';
import { CajaDetalleNotaDialog } from '@/components/CajaDetalleNotaDialog';

const originalFetch = global.fetch;

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

test('muestra created_at formateado en Chile, nunca el texto crudo', async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      created_at: '2026-11-20 02:30:00+00', // 23:30 del 19 en Chile
      cliente_nombre: 'Ana',
      cliente_telefono: '912345678',
      items: [],
      total: 0,
      total_pagado: 0,
      saldo_favor_aplicado: 0,
      saldo_pendiente: 0,
    }),
  })) as any;

  render(<CajaDetalleNotaDialog notaId={7} open onOpenChange={() => {}} />);

  expect(await screen.findByText(/19 nov 2026, 23:30/)).toBeInTheDocument();
  expect(screen.queryByText(/2026-11-20 02:30:00/)).toBeNull();
});
