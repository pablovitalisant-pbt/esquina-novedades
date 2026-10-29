/**
 * @jest-environment jsdom
 *
 * Fase B — Slice 5: textos visibles "Por mayor" / "Por menor".
 * No cambia valores internos ('detalle'/'mayor'/'menor'/'mixta').
 */

import React from 'react';
import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProductCard } from '@/components/ProductCard';
import { ProductDrawer } from '@/components/ProductDrawer';
import { AgregarANotaVentaModal } from '@/components/AgregarANotaVentaModal';
import { PrenotaDetallePage } from '@/app/(app)/notas-venta/[id]/client_page';

jest.mock('@/config/feature-flags.json', () => ({ 'precio-mayorista-ui': true, 'notas-venta-modalidad': true }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), useParams: () => ({ id: '1' }) }));
jest.mock('@/components/PagarNotaDialog', () => ({ PagarNotaDialog: () => null }));
jest.mock('@/components/AplicarSaldoFavorDialog', () => ({ AplicarSaldoFavorDialog: () => null }));
jest.mock('@/components/ImageWithFallback', () => ({ ImageWithFallback: () => <div /> }));

const mockSheets: any[] = [];
jest.mock('exceljs', () => ({
  Workbook: class {
    addWorksheet(name: string) {
      const sheet: any = { name, columns: [], rows: [] };
      sheet.addRows = (r: any[]) => { sheet.rows.push(...r); };
      mockSheets.push(sheet);
      return sheet;
    }
    xlsx = { writeBuffer: async () => new ArrayBuffer(0) };
  },
}));

let mockAutoTable: any = null;
const mockSave = jest.fn();
jest.mock('jspdf-autotable', () => (_doc: any, opts: any) => { mockAutoTable = opts; });
jest.mock('jspdf', () => class {
  internal = { pageSize: { getWidth: () => 200, getHeight: () => 280 } };
  addImage = jest.fn(); setFont = jest.fn(); text = jest.fn(); save = mockSave;
  setFontSize = jest.fn(); setFillColor = jest.fn(); rect = jest.fn(); roundedRect = jest.fn();
  setTextColor = jest.fn(); setDrawColor = jest.fn(); setLineWidth = jest.fn(); line = jest.fn();
  lastAutoTable = { finalY: 100 }; addPage = jest.fn();
});

const producto: any = {
  id: 1, codigo: 'A1', detalle: 'Prod', prcventa: 2500, costo: 1000, margen_pct: 150, saldo: 10,
  umed: 'U', cantcaja: 12, pesocaja: 1, cubicaja: 1, es_nuevo: false, categoria: null,
  stock_minimo: null, imagen_url: null, precio_mayor: 30000, minimo_mayor: 3,
};
const admin: any = { id: '1', rut: '1-1', nombre: 'A', rol: 'admin', empresas: [1] };

describe('ProductCard / ProductDrawer — textos', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ProductCard dice "Por mayor: $X"', () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: producto }) });
    render(<ProductCard producto={producto} empresaSlug="x" onClick={() => {}} />);
    expect(screen.getByText(/^Por mayor: /)).toHaveTextContent('30');
  });

  it('ProductDrawer usa "por menor"/"por mayor" en labels y ganancias', () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: producto }) });
    render(<ProductDrawer producto={producto} session={admin} open onOpenChange={() => {}} onUpdated={() => {}} />);
    expect(screen.getByText('Precio por mayor')).toBeInTheDocument();
    expect(screen.getByText('Ganancia por mayor')).toBeInTheDocument();
    expect(screen.getByText('Por mayor en tienda online desde (unidades)')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Editar producto'));
    expect(screen.getByText('Precio por menor *')).toBeInTheDocument();
    expect(screen.getByText('Ganancia por menor')).toBeInTheDocument();
  });
});

describe('AgregarANotaVentaModal — botones', () => {
  it('selector dice "Por menor" y "Por mayor"', async () => {
    global.fetch = jest.fn((url: string) => url === '/api/notas-venta'
      ? Promise.resolve({ ok: true, json: async () => ({ data: [{ id: 1, titulo: 'Nota 1' }] }) })
      : Promise.resolve({ ok: true, json: async () => ({ id: 9 }) })) as any;
    render(<AgregarANotaVentaModal open onClose={jest.fn()} producto={{ ...producto, empresa_id: 1 }} />);
    await screen.findByText('Nota 1');
    expect(screen.getByRole('button', { name: /^por menor$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^por mayor$/i })).toBeInTheDocument();
  });
});

describe('nota de venta — textos visibles', () => {
  const mayor = { id: 'm1', codigo: 'M-001', descripcion: 'Mayor', modalidad: 'mayor', unidades: 36, precio: 10000, subtotal: '30000.00' };

  function mockFetch(items: any[]) {
    return jest.fn((url: string, opts?: any) => {
      if (url === '/api/notas-venta/1' && !opts?.method) {
        return Promise.resolve({ ok: true, json: async () => ({ id: '1', titulo: 'Nota', estado: 'activa', saldo_pendiente: 0, total_pagado: 0, items }) });
      }
      if (url.startsWith('/api/productos?search=')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [{ codigo: 'P-1', detalle: 'Prod', imagen_url: null, empresa_id: 1, prcventa: 1500, precio_mayor: 900, saldo: 20 }] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }) as any;
  }

  async function renderNota(items: any[]) {
    global.fetch = mockFetch(items);
    render(<PrenotaDetallePage session={{}} params={{ id: '1' }} />);
    await screen.findByText(items[0].codigo);
  }

  beforeEach(() => jest.clearAllMocks());

  it('badge de tipo "POR MAYOR", tabla "Por mayor" y select "Por menor"/"Por mayor"', async () => {
    await renderNota([mayor]);
    expect(screen.getByText('POR MAYOR')).toBeInTheDocument();
    expect(screen.getByText('Por mayor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    expect(screen.getByRole('option', { name: 'Por menor' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Por mayor' })).toBeInTheDocument();
  });

  it('buscador muestra "por menor" y "Por mayor: $X"', async () => {
    await renderNota([mayor]);
    fireEvent.change(screen.getByPlaceholderText(/buscar por c[oó]digo o descripci[oó]n/i), { target: { value: 'pro' } });
    await screen.findByText('Prod');
    expect(screen.getByText('por menor')).toBeInTheDocument();
    expect(screen.getByText('Por mayor: $900')).toBeInTheDocument();
  });

  it('Excel y PDF usan "Por mayor"/"Por menor"', async () => {
    await renderNota([mayor]);
    (global as any).URL.createObjectURL = jest.fn(() => 'blob:x');
    (global as any).URL.revokeObjectURL = jest.fn();
    mockSheets.length = 0;
    fireEvent.click(screen.getByText('Exportar Excel'));
    await waitFor(() => expect(mockSheets).toHaveLength(2));
    expect(mockSheets[1].rows[0]).toMatchObject({ Modalidad: 'Por mayor' });

    fireEvent.click(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockAutoTable.body[0][6]).toBe('Por mayor');
  });
});

describe('pedidos y mensajes de API — "por mayor"/"por menor"', () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

  it.each([
    'app/(app)/pedidos/client_page.tsx',
    'app/pedido/[id]/page.tsx',
  ])('%s dice "(por mayor)"', (rel) => {
    expect(read(rel)).toContain('(por mayor)');
    expect(read(rel)).not.toContain('(precio mayor)');
  });

  it.each([
    'app/api/productos/route.ts',
    'app/api/productos/[id]/route.ts',
    'app/api/notas-venta/[id]/items/route.ts',
    'app/api/notas-venta/[id]/items/[itemId]/route.ts',
  ])('%s no expone "precio mayor" sin "por"', (rel) => {
    const s = read(rel);
    expect(s).not.toMatch(/precio mayor(?! de venta)/i);
  });
});
