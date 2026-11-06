/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/pagos-app/acceso', () => ({ rolPagosApp: jest.fn() }));
jest.mock('@/lib/pagos-app/resumen', () => ({ leerResumenPagosApp: jest.fn() }));
jest.mock('next/navigation', () => ({ notFound: jest.fn() }));

import { getServerSession } from 'next-auth';
import { rolPagosApp } from '@/lib/pagos-app/acceso';
import { leerResumenPagosApp } from '@/lib/pagos-app/resumen';
import { notFound } from 'next/navigation';
import Pagina from '@/app/(app)/admin/pagos-app/page';

const sesionMock = getServerSession as jest.Mock;
const guardMock = rolPagosApp as jest.Mock;
const leerMock = leerResumenPagosApp as jest.Mock;
const notFoundMock = jest.mocked(notFound);

const RESUMEN = {
  total: 100000,
  abonado: 60000,
  saldo: 40000,
  progreso: 60,
  pagos: [{
    id: 'pago-1',
    fecha: '2026-10-01',
    medio: 'transferencia',
    monto_clp: 60000,
    detalle: 'Abono inicial',
    reversa_de: null,
    tiene_comprobante: true,
  }],
};

beforeEach(() => {
  jest.clearAllMocks();
  sesionMock.mockResolvedValue({ user: { id: '101', rol: 'admin' } });
});

it('tercero: 404 sin consultar pagos', async () => {
  guardMock.mockReturnValue(null);
  notFoundMock.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND');
  });

  await expect(Pagina()).rejects.toThrow('NEXT_NOT_FOUND');

  expect(notFoundMock).toHaveBeenCalledTimes(1);
  expect(leerMock).not.toHaveBeenCalled();
});

it('admin autorizado: montos, progreso, historial y link de comprobante', async () => {
  guardMock.mockReturnValue('pablo');
  leerMock.mockResolvedValue(RESUMEN);

  render(await Pagina());

  expect(screen.getByText(/total/i)).toBeInTheDocument();
  expect(screen.getByText(/100\.000/)).toBeInTheDocument();
  expect(screen.getAllByText(/60\.000/).length).toBeGreaterThan(0);
  expect(screen.getByText(/40\.000/)).toBeInTheDocument();
  expect(screen.getByText(/60\s*%/)).toBeInTheDocument();
  expect(screen.getByText('Abono inicial')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /comprobante/i }))
    .toHaveAttribute('href', '/api/admin/pagos-app/pago-1/comprobante');
});
