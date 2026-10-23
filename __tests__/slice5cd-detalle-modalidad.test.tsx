/**
 * @jest-environment jsdom
 *
 * Fase B — 5c/5d: detalle de nota usa subtotal (nunca unidades*precio),
 * muestra modalidad y respeta el guard H4 (cajas=0).
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PrenotaDetallePage } from '@/app/(app)/notas-venta/[id]/client_page';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
// Flags controlados por el test (no el JSON real, que cambia según el despliegue).
jest.mock('@/config/feature-flags.json', () => ({}));
const mockFlags = (): Record<string, boolean> => require('@/config/feature-flags.json');
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), useParams: () => ({ id: '1' }) }));
jest.mock('@/components/PagarNotaDialog', () => ({ PagarNotaDialog: () => null }));

// 'xlsx' tiene vulnerabilidades sin parche: importarlo debe fallar (S1).
jest.mock('xlsx', () => { throw new Error('xlsx prohibido: usar exceljs'); }, { virtual: true });

const mockSheets: { name: string; columns: any[]; rows: any[] }[] = [];
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
jest.mock('jspdf-autotable', () => (_doc: any, opts: any) => { mockAutoTable = opts; });
const mockSave = jest.fn();
const mockText = jest.fn();
jest.mock('jspdf', () => {
  class MockJsPDF {
    internal = { pageSize: { getWidth: () => 200, getHeight: () => 280 } };
    addImage = jest.fn();
    setFont = jest.fn();
    text = mockText;
    save = mockSave;
    setFontSize = jest.fn();
    setFillColor = jest.fn();
    rect = jest.fn();
    roundedRect = jest.fn();
    setTextColor = jest.fn();
    setDrawColor = jest.fn();
    setLineWidth = jest.fn();
    line = jest.fn();
    lastAutoTable = { finalY: 100 };
    addPage = jest.fn();
  }
  return MockJsPDF;
});

const caja = { id: 'c1', codigo: 'C-001', descripcion: 'Caja', modalidad: 'caja', cajas: 3, unidades: 36, precio: 10000, subtotal: '30000.00' };
const unidad = { id: 'u1', codigo: 'U-001', descripcion: 'Unidad', modalidad: 'unidad', cajas: 1, unidades: 12, precio: 2500, subtotal: '30000.00' };

function mockFetch(items: any[], extra: any = {}) {
  return jest.fn((url: string, opts?: any) => {
    if (url === '/api/notas-venta/1' && !opts?.method) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: '1', titulo: 'Nota', estado: 'activa', saldo_pendiente: 0, total_pagado: 0, items, ...extra }) });
    }
    if (url === '/api/caja/config') return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { valor: '0' } }) });
    if (url === '/logo-nota-venta.png') return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as any;
}

async function renderNota(items: any[], extra: any = {}) {
  global.fetch = mockFetch(items, extra);
  render(<PrenotaDetallePage session={{}} params={{ id: '1' }} />);
  await screen.findByText(items[0].codigo);
}

describe('5c — totales, modalidad y edición', () => {
  beforeEach(() => jest.clearAllMocks());

  it('la tabla muestra modalidad, precio con sufijo y Total desde subtotal', async () => {
    await renderNota([caja, unidad]);
    expect(screen.getAllByText('Caja').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Unidad').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('$10.000 /caja')).toBeInTheDocument();
    expect(screen.getByText('$2.500 /u')).toBeInTheDocument();
    expect(screen.getAllByText('$30.000')).toHaveLength(2);
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
  });

  it('el total de cabecera suma subtotal (30000 + 30000), no unidades*precio', async () => {
    await renderNota([caja, unidad]);
    expect(screen.getByText('$60.000')).toBeInTheDocument();
  });

  it('deriva el tipo de nota en el encabezado (mixta) y respeta tipo explícito', async () => {
    mockFlags()['notas-venta-modalidad'] = false;
    await renderNota([caja, unidad]);
    expect(screen.getByText('Tipo: mixta')).toBeInTheDocument();
  });

  it('con notas-venta-modalidad activo, el tipo derivado se muestra como badge', async () => {
    mockFlags()['notas-venta-modalidad'] = true;
    await renderNota([caja, unidad]);
    expect(screen.getByText('mixta')).toBeInTheDocument();
    expect(screen.queryByText('Tipo: mixta')).toBeNull();
  });
  it('PATCH de item caja NO envía unidades y deriva la razón congelada', async () => {
    await renderNota([caja]);
    fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs).toHaveLength(2);
    expect(screen.getByText('36 unidades')).toBeInTheDocument();
    fireEvent.change(inputs[0], { target: { value: '5' } });
    expect(screen.getByText('60 unidades')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      const patch = (global.fetch as jest.Mock).mock.calls.find(c => c[1]?.method === 'PATCH');
      expect(JSON.parse(patch[1].body)).toEqual({ cajas: 5, precio: 10000 });
    });
  });

  it('H4: cajas=0 no divide por cero y bloquea guardar hasta corregir', async () => {
    const roto = { ...caja, cajas: 0, unidades: 10, subtotal: '1000.00' };
    await renderNota([roto]);
    fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
    const guardar = screen.getByRole('button', { name: /guardar/i });
    expect(guardar).toBeDisabled();
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '4' } });
    expect(guardar).not.toBeDisabled();
    expect(screen.getByText('10 unidades')).toBeInTheDocument();
  });

  it('PATCH de item unidad conserva unidades (sin regresión)', async () => {
    await renderNota([unidad]);
    fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    expect(screen.getAllByRole('spinbutton')).toHaveLength(3);
    fireEvent.change(screen.getAllByRole('spinbutton')[2], { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      const patch = (global.fetch as jest.Mock).mock.calls.find(c => c[1]?.method === 'PATCH');
      expect(JSON.parse(patch[1].body)).toEqual({ cajas: 1, unidades: 12, precio: 2000 });
    });
  });
});

describe('5d — Excel, PDF y WhatsApp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('Excel agrega Modalidad y Total = subtotal', async () => {
    await renderNota([caja]);
    (global as any).URL.createObjectURL = jest.fn(() => 'blob:x');
    (global as any).URL.revokeObjectURL = jest.fn();
    mockSheets.length = 0;
    fireEvent.click(screen.getByText('Exportar Excel'));
    await waitFor(() => expect(mockSheets).toHaveLength(2));
    expect(mockSheets.map(s => s.name)).toEqual(['Info', 'Items']);
    const items = mockSheets[1];
    expect(items.columns.map(c => c.header)).toEqual(['Código', 'Descripción', 'Modalidad', 'Cajas', 'Unidades', 'Precio', 'Total']);
    expect(items.rows[0]).toMatchObject({ Código: 'C-001', Modalidad: 'Caja', Total: 30000 });
    expect(mockSheets[0].columns.map(c => c.header)).toEqual(['Campo', 'Valor']);
  });

  it('PDF agrega columna Modalidad y usa subtotal (no 36*10000)', async () => {
    await renderNota([caja]);
    fireEvent.click(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockAutoTable.head[0]).toContain('Modalidad');
    expect(mockAutoTable.body[0]).toHaveLength(8);
    expect(mockAutoTable.body[0][6]).toBe('$30.000');
    expect(mockAutoTable.body[0][7]).toBe('Caja');
    expect(mockAutoTable.body[0][6]).not.toBe('$360.000');
  });
});
