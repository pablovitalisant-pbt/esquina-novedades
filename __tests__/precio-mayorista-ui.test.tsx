/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ProductCard } from '@/components/ProductCard';
import { ProductDrawer } from '@/components/ProductDrawer';

jest.mock('@/config/feature-flags.json', () => ({ 'precio-mayorista-ui': true }));
const mockFlags = (): Record<string, boolean> => require('@/config/feature-flags.json');
jest.mock('@/components/ImageWithFallback', () => ({ ImageWithFallback: () => <div /> }));

const base: any = {
  id: 1, codigo: 'A1', detalle: 'Prod', prcventa: 2500, costo: 1000, margen_pct: 150, saldo: 10,
  umed: 'U', cantcaja: 12, pesocaja: 1, cubicaja: 1, es_nuevo: false, categoria: null,
  stock_minimo: null, imagen_url: null, precio_mayor: 30000,
};
const admin: any = { id: '1', rut: '1-1', nombre: 'A', rol: 'admin', empresas: [1] };
const card = (p: any, extra: any = {}) =>
  render(<ProductCard producto={p} empresaSlug="x" empresaNombre="x" onClick={() => {}} {...extra} />);
const drawer = (p: any) =>
  render(<ProductDrawer producto={p} empresaNombre="" session={admin} open onOpenChange={() => {}} onUpdated={() => {}} />);
const guardar = async () => {
  fireEvent.click(screen.getByText(/guardar/i));
  const put = () => (global.fetch as jest.Mock).mock.calls.find((c: any[]) => c[1]?.method === 'PUT');
  await waitFor(() => expect(put()).toBeDefined());
  return JSON.parse(put()[1].body);
};

beforeEach(() => {
  mockFlags()['precio-mayorista-ui'] = true;
  (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: base }) });
});

describe('ProductCard Mayor: $X', () => {
  test('flag on y precio_mayor => muestra', () => {
    card(base);
    expect(screen.getByText(/Mayor:/)).toHaveTextContent('30');
  });
  test('flag off => no muestra', () => {
    mockFlags()['precio-mayorista-ui'] = false;
    card(base);
    expect(screen.queryByText(/Mayor:/)).toBeNull();
  });
  test('precio_mayor null => no muestra', () => {
    card({ ...base, precio_mayor: null });
    expect(screen.queryByText(/Mayor:/)).toBeNull();
  });
  test('ocultarPrecios => no muestra', () => {
    card(base, { ocultarPrecios: true });
    expect(screen.queryByText(/Mayor:/)).toBeNull();
  });
});

describe('ProductDrawer precio mayor', () => {
  test('fila de lectura con flag on', () => {
    drawer(base);
    expect(screen.getByText('Precio mayor')).toBeInTheDocument();
  });
  test('flag off: sin fila ni input', () => {
    mockFlags()['precio-mayorista-ui'] = false;
    drawer(base);
    fireEvent.click(screen.getByTitle('Editar producto'));
    expect(screen.queryByText('Precio mayor')).toBeNull();
    expect(screen.queryByTestId('precio-mayor-input')).toBeNull();
  });
  test('vaciar input envia precio_mayor null', async () => {
    drawer(base);
    fireEvent.click(screen.getByTitle('Editar producto'));
    fireEvent.change(screen.getByTestId('precio-mayor-input'), { target: { value: '' } });
    expect((await guardar()).precio_mayor).toBeNull();
  });
  test('valor se envia como numero', async () => {
    drawer(base);
    fireEvent.click(screen.getByTitle('Editar producto'));
    fireEvent.change(screen.getByTestId('precio-mayor-input'), { target: { value: '25000' } });
    expect((await guardar()).precio_mayor).toBe(25000);
  });
  test('flag off no envia precio_mayor', async () => {
    mockFlags()['precio-mayorista-ui'] = false;
    drawer(base);
    fireEvent.click(screen.getByTitle('Editar producto'));
    expect('precio_mayor' in (await guardar())).toBe(false);
  });
});
