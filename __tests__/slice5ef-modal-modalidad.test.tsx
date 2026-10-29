/**
 * @jest-environment jsdom
 *
 * Fase B — 5e/3b: selector Detalle/Mayor en el modal de agregar a nota.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AgregarANotaVentaModal } from '@/components/AgregarANotaVentaModal';

jest.mock('@/config/feature-flags.json', () => ({ 'notas-venta-modalidad': true }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const base = { codigo: 'A', detalle: 'P', imagen_url: null, empresa_id: 2, prcventa: 2500, cantcaja: 12, saldo: 100 };

async function renderModal(producto: any) {
  global.fetch = jest.fn((url: string) => url === '/api/notas-venta'
    ? Promise.resolve({ ok: true, json: async () => ({ data: [{ id: 1, titulo: 'Nota 1' }] }) })
    : Promise.resolve({ ok: true, json: async () => ({ id: 9 }) })) as any;
  render(<AgregarANotaVentaModal open onClose={jest.fn()} producto={producto} />);
  await screen.findByText('Nota 1');
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
}

describe('5e — selector Detalle/Mayor', () => {
  it('Mayor habilitado con precio_mayor', async () => {
    await renderModal({ ...base, precio_mayor: 10000 });
    expect(screen.getByRole('button', { name: /^por mayor$/i })).not.toBeDisabled();
  });

  it('Mayor deshabilitado sin precio_mayor', async () => {
    await renderModal({ ...base, precio_mayor: null });
    expect(screen.getByRole('button', { name: /^por mayor$/i })).toBeDisabled();
  });

  it('Mayor usa precio_mayor y manda modalidad sin cajas', async () => {
    await renderModal({ ...base, precio_mayor: 10000 });
    fireEvent.click(screen.getByRole('button', { name: /^por mayor$/i }));
    expect((screen.getAllByRole('spinbutton')[1] as HTMLInputElement).value).toBe('10000');
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '12' } });
    expect(screen.getByText('12 unidades')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }));
    await waitFor(() => {
      const call = (global.fetch as jest.Mock).mock.calls.find(c => String(c[0]).includes('/items'));
      expect(JSON.parse(call[1].body)).toMatchObject({ modalidad: 'mayor', precio: 10000, unidades: 12 });
      expect(JSON.parse(call[1].body)).not.toHaveProperty('cajas');
    });
  });

  it('por defecto Detalle usa prcventa', async () => {
    await renderModal({ ...base, precio_mayor: 10000 });
    expect(screen.getByRole('button', { name: /^por menor$/i })).toBeInTheDocument();
    expect((screen.getAllByRole('spinbutton')[1] as HTMLInputElement).value).toBe('2500');
  });
});
