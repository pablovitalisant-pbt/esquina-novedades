/**
 * @jest-environment jsdom
 */

/**
 * Fase B — Slice 2b (UI): precios directos en productos.
 * Contrato: sin % de ganancia editable; costo + precios directos; ganancias
 * derivadas con calcularMargen; sin rama legacy en el drawer.
 */
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ProductCard } from '@/components/ProductCard';
import { ProductDrawer } from '@/components/ProductDrawer';
import { PreciosClient } from '@/app/(app)/precios/client_page';

jest.mock('@/config/feature-flags.json', () => ({ 'precio-mayorista-ui': true }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/components/ImageWithFallback', () => ({ ImageWithFallback: () => <div /> }));
jest.mock('@/hooks/useShareImage', () => ({ useShareImage: () => ({ shareImage: jest.fn() }) }));

const producto: any = {
  id: 1, empresa_id: 1, codigo: 'P1', detalle: 'Prod', prcventa: 1500, costo: 1000,
  margen_pct: 50, saldo: 10, umed: 'U', cantcaja: 12, pesocaja: 1, cubicaja: 1,
  es_nuevo: false, categoria: null, stock_minimo: null, imagen_url: null,
  precio_mayor: 900, minimo_mayor: 3, prcminimo: null,
};
const admin: any = { id: '1', rut: '1-1', nombre: 'A', rol: 'admin', empresas: [1] };

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes('/api/categorias')) return { ok: true, json: async () => [] };
    return { ok: true, json: async () => ({ data: producto }) };
  });
  (global as any).fetch = fetchMock;
});

const putBody = async () => {
  const put = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'PUT');
  return JSON.parse(put![1].body);
};

const renderDrawer = (p: any = producto) =>
  render(<ProductDrawer producto={p} empresaNombre="" session={admin} open onOpenChange={() => {}} onUpdated={() => {}} />);

describe('ProductDrawer — edicion directa', () => {
  test('no hay % de ganancia editable ni rama legacy; siempre costo/precio detalle/precio mayor/minimo', () => {
    renderDrawer();
    fireEvent.click(screen.getByTitle('Editar producto'));
    expect(screen.queryByText(/% Ganancia/)).toBeNull();
    expect(screen.queryByText(/legacy/i)).toBeNull();
    expect(screen.getByTestId('edit-costo')).toBeInTheDocument();
    expect(screen.getByTestId('edit-precio-detalle')).toBeInTheDocument();
    expect(screen.getByTestId('precio-mayor-input')).toBeInTheDocument();
    expect(screen.getByTestId('edit-minimo-mayor')).toBeInTheDocument();
  });

  test('ganancias calculadas en vivo, solo lectura', () => {
    renderDrawer();
    fireEvent.click(screen.getByTitle('Editar producto'));
    expect(screen.getByTestId('ganancia-detalle').textContent).toBe('50%');
    expect(screen.getByTestId('ganancia-mayor').textContent).toBe('-10%');
    fireEvent.change(screen.getByTestId('precio-mayor-input'), { target: { value: '1200' } });
    expect(screen.getByTestId('ganancia-mayor').textContent).toBe('20%');
  });

  test('producto sin costo: no envia costo, ganancias "—"', async () => {
    renderDrawer({ ...producto, costo: null });
    fireEvent.click(screen.getByTitle('Editar producto'));
    expect(screen.getByTestId('ganancia-detalle').textContent).toBe('—');
    fireEvent.click(screen.getByText(/guardar/i));
    await waitFor(() => expect(fetchMock.mock.calls.some((c: any[]) => c[1]?.method === 'PUT')).toBe(true));
    const body = await putBody();
    expect('costo' in body).toBe(false);
    expect('margen_pct' in body).toBe(false);
    expect(body.prcventa).toBe(1500);
  });

  test('precio mayor vacio envia null; minimo se envia', async () => {
    renderDrawer();
    fireEvent.click(screen.getByTitle('Editar producto'));
    fireEvent.change(screen.getByTestId('precio-mayor-input'), { target: { value: '' } });
    fireEvent.click(screen.getByText(/guardar/i));
    await waitFor(() => expect(fetchMock.mock.calls.some((c: any[]) => c[1]?.method === 'PUT')).toBe(true));
    const body = await putBody();
    expect(body.precio_mayor).toBeNull();
    expect(body.minimo_mayor).toBe(3);
  });

  test('tabla lectura: Precio mayor, Ganancia mayor y Mayor en tienda desde', () => {
    renderDrawer();
    expect(screen.getByText('Precio mayor')).toBeInTheDocument();
    expect(screen.queryByText('Precio por caja')).toBeNull();
    expect(screen.getByText('Ganancia mayor')).toBeInTheDocument();
    expect(screen.getByText('Mayor en tienda desde')).toBeInTheDocument();
  });
});

describe('ProductCard — Mayor', () => {
  test('muestra "Mayor: $X"', () => {
    render(<ProductCard producto={producto} empresaSlug="x" empresaNombre="x" onClick={() => {}} />);
    expect(screen.getByText(/^Mayor: /)).toHaveTextContent('900');
    expect(screen.queryByText(/Caja:/)).toBeNull();
  });
});

describe('PreciosClient — dialogo Nuevo producto', () => {
  const renderClient = () =>
    render(<PreciosClient session={{ rol: 'admin', user: { id: '1', rol: 'admin' } } as any} />);

  const abrir = async () => {
    renderClient();
    fireEvent.click(await screen.findByRole('button', { name: /agregar producto/i }));
  };

  test('campos directos y ganancias en vivo; sin % de ganancia', async () => {
    await abrir();
    expect(await screen.findByTestId('crear-prcventa')).toBeInTheDocument();
    expect(screen.getByTestId('crear-precio-mayor')).toBeInTheDocument();
    expect(screen.getByTestId('crear-minimo-mayor')).toBeInTheDocument();
    expect(screen.queryByText(/% de ganancia/)).toBeNull();

    fireEvent.change(screen.getByTestId('crear-costo'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('crear-prcventa'), { target: { value: '150' } });
    expect(screen.getByTestId('ganancia-detalle').textContent).toBe('50%');
    fireEvent.change(screen.getByTestId('crear-precio-mayor'), { target: { value: '120' } });
    expect(screen.getByTestId('ganancia-mayor').textContent).toBe('20%');
  });

  test('minimo deshabilitado sin precio mayor', async () => {
    await abrir();
    expect((await screen.findByTestId('crear-minimo-mayor')).closest('input')).toBeDisabled();
  });

  test('valida precio mayor < precio detalle', async () => {
    const { toast } = require('sonner');
    await abrir();
    fireEvent.change(screen.getByTestId('crear-codigo'), { target: { value: 'N1' } });
    fireEvent.change(screen.getByTestId('crear-detalle'), { target: { value: 'Nuevo' } });
    fireEvent.change(screen.getByTestId('crear-costo'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('crear-prcventa'), { target: { value: '1000' } });
    fireEvent.change(screen.getByTestId('crear-precio-mayor'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: /crear producto/i }));
    expect(toast.error).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some((c: any[]) => c[1]?.method === 'POST')).toBe(false);
  });

  test('envia prcventa/precio_mayor/minimo_mayor y nunca margen_pct', async () => {
    await abrir();
    fireEvent.change(screen.getByTestId('crear-codigo'), { target: { value: 'N1' } });
    fireEvent.change(screen.getByTestId('crear-detalle'), { target: { value: 'Nuevo' } });
    fireEvent.change(screen.getByTestId('crear-costo'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('crear-prcventa'), { target: { value: '1000' } });
    fireEvent.change(screen.getByTestId('crear-precio-mayor'), { target: { value: '900' } });
    fireEvent.change(screen.getByTestId('crear-minimo-mayor'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /crear producto/i }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c: any[]) => c[1]?.method === 'POST')).toBe(true));
    const post = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'POST');
    const body = JSON.parse(post![1].body);
    expect(body).toMatchObject({ codigo: 'N1', prcventa: 1000, precio_mayor: 900, minimo_mayor: 3, costo: 100 });
    expect('margen_pct' in body).toBe(false);
  });
});

describe('Sin "Precio por caja" en UI de precios', () => {
  test.each(['app/(app)/precios/client_page.tsx', 'components/ProductDrawer.tsx'])('%s', (rel) => {
    const content = fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');
    expect(content).not.toContain('Precio por caja');
  });
});
