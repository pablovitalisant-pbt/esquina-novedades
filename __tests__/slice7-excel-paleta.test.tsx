/**
 * @jest-environment jsdom
 */
// Slice 7 — Excel de notas de venta con la paleta de marca.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PrenotaDetallePage } from '@/app/(app)/notas-venta/[id]/client_page';
import { EMPRESA, hexToArgb } from '@/lib/empresa';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), useParams: () => ({ id: '1' }) }));
jest.mock('@/components/PagarNotaDialog', () => ({ PagarNotaDialog: () => null }));
jest.mock('@/components/AplicarSaldoFavorDialog', () => ({ AplicarSaldoFavorDialog: () => null }));
jest.mock('jspdf', () => class { internal = { pageSize: { getWidth: () => 200, getHeight: () => 280 } }; });
jest.mock('jspdf-autotable', () => jest.fn());

type Ficha = { fill?: { fgColor?: { argb?: string } }; font?: { color?: { argb?: string } }; border?: Record<string, unknown> };

const filasEncabezado: Ficha[] = [];
const hojas: string[] = [];

jest.mock('exceljs', () => ({
  Workbook: class {
    addWorksheet(name: string) {
      hojas.push(name);
      const ws: Record<string, unknown> = {
        columns: [],
        addRows: jest.fn(),
        getRow: () => ({
          eachCell: (cb: (cell: Ficha) => void) => {
            const cell: Ficha = {};
            cb(cell);
            filasEncabezado.push(cell);
          },
        }),
      };
      return ws;
    }
    xlsx = { writeBuffer: async () => new ArrayBuffer(0) };
  },
}));

const item = {
  id: 1, codigo: 'A1', descripcion: 'Prod', imagen_url: null, modalidad: 'detalle',
  unidades: 2, precio: 1000, subtotal: 2000,
};
const prenota = {
  id: '1', titulo: 'Nota', nombre_cliente: 'Ana', estado: 'activa',
  total_pagado: 0, saldo_pendiente: 2000, items: [item],
};

beforeEach(() => {
  jest.clearAllMocks();
  filasEncabezado.length = 0;
  hojas.length = 0;
  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn((url: string) =>
    Promise.resolve({ ok: true, json: async () => (url === '/api/notas-venta/1' ? prenota : {}) })
  );
  (global as unknown as { URL: { createObjectURL: jest.Mock; revokeObjectURL: jest.Mock } }).URL.createObjectURL = jest.fn(() => 'blob:x');
  (global as unknown as { URL: { revokeObjectURL: jest.Mock } }).URL.revokeObjectURL = jest.fn();
});

it('el encabezado de cada hoja usa fondo violeta, texto claro y borde de marca', async () => {
  render(<PrenotaDetallePage session={{}} params={{ id: '1' }} />);
  await screen.findByText('A1');
  fireEvent.click(screen.getByText('Exportar Excel'));
  await waitFor(() => expect(hojas).toHaveLength(2));

  const violeta = hexToArgb(EMPRESA.colores.primario);
  const texto = hexToArgb(EMPRESA.colores.textoClaro);
  const borde = hexToArgb(EMPRESA.colores.borde);
  expect(filasEncabezado.length).toBeGreaterThan(0);
  for (const celda of filasEncabezado) {
    expect(celda.fill?.fgColor?.argb).toBe(violeta);
    expect(celda.font?.color?.argb).toBe(texto);
    expect(celda.border?.top).toMatchObject({ color: { argb: borde } });
  }
});
