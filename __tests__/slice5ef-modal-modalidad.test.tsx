/**
 * @jest-environment jsdom
 *
 * Fase B — 5e: selector Unidad/Caja en el modal de agregar a nota.
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

describe('5e — selector Unidad/Caja', () => {
  it('Caja habilitado con precio_mayor y cantcaja > 0', async () => {
    await renderModal({ ...base, precio_mayor: 10000 });
    expect(screen.getByRole('button', { name: /^caja$/i })).not.toBeDisabled();
  });

  it('Caja deshabilitado sin precio_mayor o con cantcaja 0', async () => {
    await renderModal({ ...base, precio_mayor: null });
    expect(screen.getByRole('button', { name: /^caja$/i })).toBeDisabled();
  });

  it('Caja deshabilitado con cantcaja 0', async () => {
    await renderModal({ ...base, precio_mayor: 10000, cantcaja: 0 });
    expect(screen.getByRole('button', { name: /^caja$/i })).toBeDisabled();
  });

  it('Caja usa precio_mayor, muestra unidades y manda modalidad', async () => {
    await renderModal({ ...base, precio_mayor: 10000 });
    fireEvent.click(screen.getByRole('button', { name: /^caja$/i }));
    expect((screen.getAllByRole('spinbutton')[1] as HTMLInputElement).value).toBe('10000');
    expect(screen.getByText('12 unidades')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }));
    await waitFor(() => {
      const call = (global.fetch as jest.Mock).mock.calls.find(c => String(c[0]).includes('/items'));
      expect(JSON.parse(call[1].body)).toMatchObject({ modalidad: 'caja', precio: 10000, cajas: 1, unidades: 12 });
    });
  });

  it('por defecto Unidad usa prcventa', async () => {
    await renderModal({ ...base, precio_mayor: 10000 });
    expect(screen.getByRole('button', { name: /^unidad$/i })).toBeInTheDocument();
    expect((screen.getAllByRole('spinbutton')[1] as HTMLInputElement).value).toBe('2500');
  });
});
