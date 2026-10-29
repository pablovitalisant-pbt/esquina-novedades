/**
 * @jest-environment jsdom
 *
 * Fase B — 5e/5f: badge de tipo de nota (mayor/menor/mixta) tras flag.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { PrenotasPage } from '@/app/(app)/notas-venta/client_page';
import { PrenotaDetallePage } from '@/app/(app)/notas-venta/[id]/client_page';

jest.mock('@/config/feature-flags.json', () => ({ 'notas-venta-modalidad': true }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), useParams: () => ({ id: '1' }) }));

it('la lista muestra el tipo devuelto por la API', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [{ id: 1, titulo: 'Nota #1', created_at: '2026-10-01', tipo: 'mixta', total: 60000 }] }),
  }) as any;
  render(<PrenotasPage session={{ user: { rol: 'vendedor' } }} />);
  await screen.findByText('Nota #1');
  expect(screen.getByText('MIXTA')).toBeInTheDocument();
});

it('el detalle muestra el badge derivado de los items', async () => {
  const items = [
    { id: 'c1', codigo: 'C-001', modalidad: 'mayor', unidades: 36, precio: 10000, subtotal: '30000.00' },
    { id: 'u1', codigo: 'U-001', modalidad: 'detalle', unidades: 12, precio: 2500, subtotal: '30000.00' },
  ];
  global.fetch = jest.fn((url: string) => url === '/api/notas-venta/1'
    ? Promise.resolve({ ok: true, json: async () => ({ id: '1', titulo: 'Nota', items, total: 60000, total_pagado: 0 }) })
    : Promise.resolve({ ok: true, json: async () => ({}) })) as any;
  render(<PrenotaDetallePage session={{}} params={{ id: '1' }} />);
  await screen.findByText('C-001');
  expect(screen.getByText('MIXTA')).toBeInTheDocument();
});
