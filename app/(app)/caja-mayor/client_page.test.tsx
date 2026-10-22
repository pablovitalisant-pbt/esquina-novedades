/**
 * @jest-environment jsdom
 */
import { render, waitFor } from '@testing-library/react';
import { CajaMayorClient } from './client_page';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('lucide-react', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/components/ui/button', () => ({ Button: ({ children }: any) => children }));
jest.mock('@/components/ui/input', () => ({ Input: (props: any) => require('react').createElement('input', props) }));
jest.mock('@/components/ui/badge', () => ({ Badge: ({ children }: any) => children }));
jest.mock('@/components/ui/dialog', () => {
  const R = require('react');
  return { Dialog: ({ children }: any) => R.createElement('div', null, children), DialogContent: ({ children }: any) => R.createElement('div', null, children), DialogHeader: ({ children }: any) => R.createElement('div', null, children), DialogTitle: ({ children }: any) => R.createElement('div', null, children), DialogFooter: ({ children }: any) => R.createElement('div', null, children) };
});

const fetchMock = jest.fn();
global.fetch = fetchMock as any;

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }) });
});

const props = { dolarDia: 1000, cuentas: [], userName: 'Admin', userRol: 'admin', userId: 1 };

describe('app/(app)/caja-mayor — lectura por fetch (sin PowerSync)', () => {
  it('carga movimientos, saldos y dólar por fetch, una vez cada uno en el mount', async () => {
    render(<CajaMayorClient {...props} />);
    const hits = (u: string) => fetchMock.mock.calls.filter((c: any[]) => String(c[0]).includes(u)).length;
    // movimientos ya se pedía 2x antes del corte (dos efectos de mount); no es regresión
    await waitFor(() => expect(hits('/api/caja/movimientos')).toBeGreaterThan(0));
    expect(hits('/api/caja/resumen-cuentas')).toBe(1);
    expect(hits('/api/caja/config')).toBe(1);
  });
});
