/**
 * @jest-environment jsdom
 */
import { render, waitFor, screen, fireEvent } from '@testing-library/react';
import { CajaMayorClient } from './client_page';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('lucide-react', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled }: any) => require('react').createElement('button', { onClick, disabled }, children),
}));
jest.mock('@/components/ui/input', () => ({ Input: (props: any) => require('react').createElement('input', props) }));
jest.mock('@/components/ui/badge', () => ({ Badge: ({ children }: any) => children }));
jest.mock('@/components/ui/dialog', () => {
  const R = require('react');
  return { Dialog: ({ children }: any) => R.createElement('div', null, children), DialogContent: ({ children }: any) => R.createElement('div', null, children), DialogHeader: ({ children }: any) => R.createElement('div', null, children), DialogTitle: ({ children }: any) => R.createElement('div', null, children), DialogFooter: ({ children }: any) => R.createElement('div', null, children) };
});

const mockWs: any = { columns: [], rows: [] as any[], views: [] };
mockWs.getRow = () => ({ eachCell: () => {} });
mockWs.addRow = (r: any) => { mockWs.rows.push(r); return { eachCell: () => {}, getCell: () => ({}) }; };
jest.mock('exceljs', () => ({
  __esModule: true,
  Workbook: class { addWorksheet() { return mockWs; } xlsx = { writeBuffer: async () => new ArrayBuffer(0) }; },
}));

const fetchMock = jest.fn();
global.fetch = fetchMock as any;

const empty = { data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } };
const mov = { id: 'm1', fecha: '2026-05-01', tipo: 'cobro', nombre_cliente: 'Ana', cuenta_id: 1, cuenta_nombre: 'Banco', monto: 12345, forma_pago: 'transferencia', observaciones: null, es_credito: false, notas_imputadas: [] };
const cierre = { id: 7, fecha_desde: '2026-04-01', fecha_hasta: '2026-04-30', usuario_nombre: 'Admin', resumen: [{ cuenta_id: 1, cuenta_nombre: 'Banco', total_cobros: 12500, total_gastos: 4000, saldo_final: 8500 }] };
const conDatos = { data: [{ tipo_fila: 'movimiento', data: mov }, { tipo_fila: 'cierre', data: cierre }], pagination: { page: 1, limit: 50, total: 2, totalPages: 1 } };

function responder(url: string) {
  const u = String(url);
  if (u.includes('/api/caja/movimientos?')) return conDatos;
  if (u.includes('/api/caja/export')) return conDatos;
  if (u.includes('/api/caja/resumen-cuentas')) return { data: [{ cuenta_id: 1, cuenta_nombre: 'Banco', saldo_neto: 8500 }] };
  return empty;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWs.rows.length = 0;
  fetchMock.mockImplementation(async (url: string) => ({ ok: true, json: async () => responder(url) }));
});

// cuentas legadas aún traen `moneda` (types/index.ts se limpia en 2e): la UI debe ignorarla
const cuentas: any = [{ id: 1, nombre: 'Banco', moneda: 'ARS', activa: true, orden: 1 }];
const props = { cuentas, userName: 'Admin', userRol: 'admin', userId: 1 };

describe('app/(app)/caja-mayor — CLP', () => {
  it('carga movimientos y saldos por fetch, sin pedir el dólar', async () => {
    render(<CajaMayorClient {...props} />);
    const hits = (u: string) => fetchMock.mock.calls.filter((c: any[]) => String(c[0]).includes(u)).length;
    await waitFor(() => expect(hits('/api/caja/movimientos')).toBeGreaterThan(0));
    expect(hits('/api/caja/resumen-cuentas')).toBe(1);
    expect(hits('/api/caja/config')).toBe(0);
  });

  it('muestra montos en CLP y ningún rastro de USD/ARS/dólar/moneda', async () => {
    const { container } = render(<CajaMayorClient {...props} />);
    await screen.findByText('$12.345');
    expect(container.textContent).toContain('$8.500');
    expect(container.textContent).not.toMatch(/\bUSD\b|\bARS\b|Dólar|Moneda|Pesos Argentinos|Bazar Naty/i);
    expect(container.querySelectorAll('option[value="USD"], option[value="ARS"]')).toHaveLength(0);
    // una cuenta legada en ARS igual es elegible (antes se filtraba por moneda)
    expect(screen.getAllByRole('option', { name: 'Banco' }).length).toBeGreaterThan(0);
  });

  it('POST de cobro no envía moneda y manda monto entero', async () => {
    render(<CajaMayorClient {...props} />);
    await screen.findByText('$12.345');
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '15000' } });
    fireEvent.click(screen.getByText(/Registrar cobro$/));
    await waitFor(() => expect(fetchMock.mock.calls.some((c: any[]) => c[1]?.method === 'POST')).toBe(true));
    const body = JSON.parse(fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'POST')![1].body);
    expect(body).not.toHaveProperty('moneda');
    expect(body.monto).toBe(15000);
    expect(body.cuenta_id).toBe(1);
  });

  it('Excel: una sola columna Monto, sin ARS/USD', async () => {
    (global as any).URL.createObjectURL = jest.fn(() => 'blob:x');
    (global as any).URL.revokeObjectURL = jest.fn();
    render(<CajaMayorClient {...props} />);
    await screen.findByText('$12.345');
    fireEvent.click(screen.getByText(/Exportar Excel/));
    await waitFor(() => expect(mockWs.rows.length).toBeGreaterThan(1));
    const headers = mockWs.columns.map((c: any) => c.header);
    expect(headers).toContain('Monto');
    expect(headers).not.toContain('ARS');
    expect(headers).not.toContain('USD');
    expect(mockWs.rows.find((r: any) => r.Fecha === '2026-05-01').Monto).toBe(12345);
    expect(mockWs.rows.find((r: any) => r['Nota(s)'] === 'Banco').Monto).toBe(8500);
  });
});
