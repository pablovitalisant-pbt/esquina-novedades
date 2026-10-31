/**
 * @jest-environment jsdom
 *
 * Fase B — Slice 3b (UI): el vendedor elige detalle/mayor por línea.
 * Intenta romper: tabla sin Cajas, PATCH sin cajas, selector de modalidad,
 * alta rápida en detalle, buscador con precio mayor, modal de agregar,
 * textos de pedidos y landing.
 */

import React from 'react';
import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PrenotaDetallePage } from '@/app/(app)/notas-venta/[id]/client_page';
import { AgregarANotaVentaModal } from '@/components/AgregarANotaVentaModal';
import { toast } from 'sonner';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/config/feature-flags.json', () => ({ 'notas-venta-modalidad': true }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), useParams: () => ({ id: '1' }) }));
jest.mock('@/components/PagarNotaDialog', () => ({ PagarNotaDialog: () => null }));
jest.mock('@/components/AplicarSaldoFavorDialog', () => ({ AplicarSaldoFavorDialog: () => null }));

const DETALLE = { id: 'u1', codigo: 'U-001', descripcion: 'Prod detalle', modalidad: 'detalle', unidades: 12, precio: 2500, subtotal: '30000.00' };
const MAYOR = { id: 'm1', codigo: 'M-001', descripcion: 'Prod mayor', modalidad: 'mayor', unidades: 6, precio: 1000, subtotal: '6000.00' };

function mockFetch(items: any[], opts: { patchBody?: any } = {}) {
  return jest.fn((url: string, req?: any) => {
    if (url === '/api/notas-venta/1' && (!req || !req.method)) {
      return Promise.resolve({ ok: true, json: async () => ({ id: '1', titulo: 'Nota', estado: 'activa', saldo_pendiente: 0, total_pagado: 0, items }) });
    }
    if (url.includes('/items/') && req?.method === 'PATCH') {
      if (opts.patchBody) return Promise.resolve({ ok: false, status: 400, json: async () => opts.patchBody });
      return Promise.resolve({ ok: true, json: async () => ({ id: 'm1', precio: 900, modalidad: 'mayor' }) });
    }
    if (url.startsWith('/api/productos?search=')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [{ codigo: 'P-1', detalle: 'Prod', imagen_url: null, empresa_id: 1, prcventa: 1500, precio_mayor: 900, saldo: 20 }] }) });
    }
    if (url.includes('/items') && req?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => ({ id: 'n1' }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }) as any;
}

async function renderNota(items: any[], opts = {}) {
  global.fetch = mockFetch(items, opts);
  render(<PrenotaDetallePage session={{}} params={{ id: '1' }} />);
  await screen.findAllByText(items[0].codigo);
}

const patches = () => (global.fetch as jest.Mock).mock.calls.filter(c => c[1]?.method === 'PATCH');

describe('tabla de items — sin cajas, modalidad por línea', () => {
  beforeEach(() => jest.clearAllMocks());

  it('no muestra columna Cajas y usa etiquetas Detalle/Mayor con precio /u', async () => {
    await renderNota([DETALLE, MAYOR]);
    expect(screen.queryByText(/^cajas$/i)).toBeNull();
    expect(screen.getByText('Por menor')).toBeInTheDocument();
    expect(screen.getByText('Por mayor')).toBeInTheDocument();
    expect(screen.getByText('$2.500 /u')).toBeInTheDocument();
    expect(screen.getByText('$1.000 /u')).toBeInTheDocument();
    expect(screen.queryByText(/\/caja/)).toBeNull();
  });

  it('deriva el tipo de nota en el encabezado con los valores nuevos', async () => {
    await renderNota([MAYOR]);
    expect(screen.getByText('POR MAYOR')).toBeInTheDocument();
  });

  it('nota solo detalle deriva "menor"', async () => {
    await renderNota([DETALLE]);
    expect(screen.getByText('POR MENOR')).toBeInTheDocument();
  });
});

describe('edición — PATCH sin cajas', () => {
  beforeEach(() => jest.clearAllMocks());

  it('Guardar manda unidades y precio, nunca cajas', async () => {
    await renderNota([DETALLE]);
    fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    const body = JSON.parse(patches()[0][1].body);
    expect(body).toEqual({ unidades: 7, precio: 2500 });
    expect(body).not.toHaveProperty('cajas');
  });

  it('cambiar el selector a Mayor manda {modalidad} sin precio', async () => {
    await renderNota([DETALLE]);
    fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'mayor' } });

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(JSON.parse(patches()[0][1].body)).toEqual({ modalidad: 'mayor' });
    await waitFor(() => expect(toast.error).not.toHaveBeenCalled());
  });

  it('si el vendedor editó el precio, el cambio de modalidad lo respeta', async () => {
    await renderNota([DETALLE]);
    fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    fireEvent.change(screen.getAllByRole('spinbutton')[1], { target: { value: '800' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'mayor' } });

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(JSON.parse(patches()[0][1].body)).toEqual({ modalidad: 'mayor', precio: 800 });
  });

  it('Mayor sin precio mayor (400 del servidor) → toast, no cambia el selector', async () => {
    await renderNota([DETALLE], { patchBody: { error: 'Producto sin precio por mayor' } });
    fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'mayor' } });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Producto sin precio por mayor'));
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('detalle');
  });
});

describe('alta rápida desde el buscador', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST en detalle con unidades:1, sin cajas ni precio', async () => {
    global.fetch = mockFetch([]);
    render(<PrenotaDetallePage session={{}} params={{ id: '1' }} />);
    await waitFor(() => expect(screen.queryByText(/no hay productos/i)).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/buscar por c[oó]digo o descripci[oó]n/i), { target: { value: 'pro' } });
    const result = await screen.findByText('Prod');
    fireEvent.click(result);

    await waitFor(() => {
      const post = (global.fetch as jest.Mock).mock.calls.find(c => c[1]?.method === 'POST');
      expect(JSON.parse(post[1].body)).toEqual({
        codigo: 'P-1', descripcion: 'Prod', imagen_url: null, empresa_id: 1,
        unidades: 1, modalidad: 'detalle', stock_referencia: 20,
      });
    });
  });

  it('el resultado muestra precio detalle y "Mayor: $X"; no muestra "cj"', async () => {
    global.fetch = mockFetch([]);
    render(<PrenotaDetallePage session={{}} params={{ id: '1' }} />);
    await waitFor(() => expect(screen.queryByText(/no hay productos/i)).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/buscar por c[oó]digo o descripci[oó]n/i), { target: { value: 'pro' } });
    await screen.findByText('Prod');
    expect(screen.getByText('Por mayor: $900')).toBeInTheDocument();
    expect(screen.queryByText(/\d+ cj/)).toBeNull();
  });
});

describe('AgregarANotaVentaModal — cantidad y modalidad', () => {
  const base = { codigo: 'ABC', detalle: 'Prod', imagen_url: null, empresa_id: 1, prcventa: 2500, precio_mayor: 1000, cantcaja: 12, saldo: 100 };

  async function renderModal(producto: any) {
    global.fetch = jest.fn((url: string) => url === '/api/notas-venta'
      ? Promise.resolve({ ok: true, json: async () => ({ data: [{ id: 1, titulo: 'Nota 1' }] }) })
      : Promise.resolve({ ok: true, json: async () => ({ id: 9 }) })) as any;
    render(<AgregarANotaVentaModal open onClose={jest.fn()} producto={producto} />);
    await screen.findByText('Nota 1');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
  }

  beforeEach(() => jest.clearAllMocks());

  it('etiqueta "Cantidad" en unidades y selector Detalle/Mayor', async () => {
    await renderModal(base);
    expect(screen.getByText(/^cantidad$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^cajas$/i)).toBeNull();
    expect(screen.getByRole('button', { name: /^por menor$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^por mayor$/i })).toBeInTheDocument();
  });

  it('Mayor deshabilitado si precio_mayor es null', async () => {
    await renderModal({ ...base, precio_mayor: null });
    expect(screen.getByRole('button', { name: /^por mayor$/i })).toBeDisabled();
  });

  it('envía {unidades, modalidad, precio} sin cajas y usa precio_mayor', async () => {
    await renderModal(base);
    fireEvent.click(screen.getByRole('button', { name: /^por mayor$/i }));
    expect((screen.getAllByRole('spinbutton')[1] as HTMLInputElement).value).toBe('1000');
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }));

    await waitFor(() => {
      const call = (global.fetch as jest.Mock).mock.calls.find(c => String(c[0]).includes('/items'));
      const body = JSON.parse(call[1].body);
      expect(body).toMatchObject({ unidades: 3, modalidad: 'mayor', precio: 1000 });
      expect(body).not.toHaveProperty('cajas');
    });
  });

  it('sin precio_mayor por defecto va en detalle con prcventa', async () => {
    await renderModal({ ...base, precio_mayor: null });
    expect((screen.getAllByRole('spinbutton')[1] as HTMLInputElement).value).toBe('2500');
  });
});

describe('grep — sin modalidad vieja en notas', () => {
  const archivos = [
    'app/(app)/notas-venta/[id]/client_page.tsx',
    'components/AgregarANotaVentaModal.tsx',
    'app/pedido/[id]/page.tsx',
    'app/(app)/pedidos/client_page.tsx',
  ];

  it.each(archivos)('%s no referencia modalidad caja/unidad', (rel) => {
    const s = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    expect(s).not.toMatch(/modalidad\s*(===|!==|:)\s*'caja'/);
    expect(s).not.toMatch(/modalidad\s*(===|!==|:)\s*'unidad'/);
  });

  it('client_page no envía cajas en POST/PATCH', () => {
    const s = fs.readFileSync(path.join(process.cwd(), 'app/(app)/notas-venta/[id]/client_page.tsx'), 'utf8');
    expect(s).not.toContain('cajas:');
  });
});
