/**
 * @jest-environment jsdom
 */
import { render, waitFor, screen, fireEvent, within, act } from '@testing-library/react';
import { CajaMayorClient } from './client_page';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
// Fase B — flag de lectura explícitamente activo.
jest.mock('@/config/feature-flags.json', () =>
  require('@/__tests__/helpers/mockFlags').mockFlags({ 'caja-detalle-nota': true }),
);
jest.mock('lucide-react', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled }: any) => require('react').createElement('button', { onClick, disabled }, children),
}));
jest.mock('@/components/ui/input', () => ({ Input: (props: any) => require('react').createElement('input', props) }));
jest.mock('@/components/ui/badge', () => ({ Badge: ({ children }: any) => children }));
jest.mock('@/components/ui/dialog', () => {
  const R = require('react');
  return { Dialog: ({ open, children }: any) => (open === false ? null : R.createElement('div', null, children)), DialogContent: ({ children }: any) => R.createElement('div', { role: 'dialog' }, children), DialogHeader: ({ children }: any) => R.createElement('div', null, children), DialogTitle: ({ children }: any) => R.createElement('h2', null, children), DialogFooter: ({ children }: any) => R.createElement('div', null, children) };
});

const mockWs: any = { columns: [], rows: [] as any[], views: [] };
const celdas: any[] = [];
mockWs.getRow = () => ({ eachCell: (cb: any) => { const cell: any = {}; cb(cell); celdas.push(cell); } });
mockWs.addRow = (r: any) => {
  mockWs.rows.push(r);
  return {
    eachCell: (cb: any) => { const cell: any = { row: r }; cb(cell); celdas.push(cell); },
    getCell: () => { const cell: any = { row: r }; celdas.push(cell); return cell; },
  };
};
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
  it('forma de pago mercadopago se muestra como "Mercado Pago" (10e)', async () => {
    const original = responder;
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => String(url).includes('/api/caja/movimientos?')
        ? { ...conDatos, data: [{ tipo_fila: 'movimiento', data: { ...mov, forma_pago: 'mercadopago' } }] }
        : original(url),
    }));
    render(<CajaMayorClient {...props} />);
    expect(await screen.findByText('💳 Mercado Pago')).toBeInTheDocument();
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
  it('Excel slice 7: encabezado violeta con texto claro y sin naranjo', async () => {
    (global as any).URL.createObjectURL = jest.fn(() => 'blob:x');
    (global as any).URL.revokeObjectURL = jest.fn();
    celdas.length = 0;
    render(<CajaMayorClient {...props} />);
    await screen.findByText('$12.345');
    fireEvent.click(screen.getByText(/Exportar Excel/));
    await waitFor(() => expect(mockWs.rows.length).toBeGreaterThan(1));

    const encabezado = celdas[0];
    expect(encabezado.fill.fgColor.argb).toBe('FF590078');
    expect(encabezado.font.color.argb).toBe('FFFFF8EA');
    expect(celdas.some((c: any) => c.fill?.fgColor?.argb === 'FFFF9900')).toBe(false);
  });
});

describe('Fase B — caja-detalle-nota', () => {
  const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const movs = { data: [
    { tipo_fila: 'movimiento', data: { ...mov, id: 'm2', nombre_cliente: 'Dos Notas', notas_imputadas: ['123', '124'] } },
    { tipo_fila: 'movimiento', data: { ...mov, id: 'm3', nombre_cliente: 'Sin Nota', notas_imputadas: [] } },
  ], pagination: { page: 1, limit: 50, total: 2, totalPages: 1 } };
  const nota = (id: number, nombre: string, producto: string) => ({
    id, fecha: '2026-11-09', nombre_cliente: nombre, cliente_nombre: nombre, cliente_telefono: '+56 9 1111 1111',
    items: [
      { codigo: 'P1', descripcion: producto, modalidad: 'detalle', unidades: 2, precio: 1000, subtotal: 2000 },
      { codigo: 'P2', descripcion: 'Muñeca articulada', modalidad: 'mayor', unidades: 3, precio: 1000, subtotal: 3000 },
    ],
    total: 5000, total_pagado: 2000, saldo_favor_aplicado: 1000, saldo_pendiente: 2000,
  });
  const n123 = nota(123, 'Ana Pérez', 'Cubo Rubik');
  const n124 = nota(124, 'Beto Soto', 'Pelota de fútbol');

  const mockCaja = (extra?: (u: string) => unknown) => fetchMock.mockImplementation(async (url: any) => {
    const u = String(url), ex = extra?.(u);
    if (ex !== undefined) return ex;
    if (u.includes('/api/caja/movimientos?')) return ok(movs);
    return u.includes('/notas-venta/123') ? ok(n123) : u.includes('/notas-venta/124') ? ok(n124) : ok({ data: [] });
  });
  const abrir = async (id: number) => {
    render(<CajaMayorClient {...props} />);
    await screen.findByText('Dos Notas');
    const trigger = screen.getByRole('button', { name: new RegExp(String(id)) });
    trigger.focus(); fireEvent.click(trigger);
    return { trigger, dialog: await screen.findByRole('dialog') };
  };
  const cerrar = async () => {
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cerrar/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  }; // foco real lo valida el smoke

  beforeEach(() => { jest.clearAllMocks(); fetchMock.mockReset(); });

  it('abre el detalle por ID, lo cierra con foco restaurado y abre la otra nota', async () => {
    mockCaja();
    const { dialog } = await abrir(123);
    await within(dialog).findByText('Ana Pérez'); // espera fin de carga
    const texto = dialog.textContent || '';
    for (const s of ['Nota de venta #123', 'Ana Pérez', '+56 9 1111 1111', '2026-11-09', 'Cubo Rubik', 'P1', '$1.000', '$2.000', '$5.000', 'Pendiente']) expect(texto).toContain(s);
    expect(texto).toMatch(/por menor/i);
    expect(texto).toMatch(/por mayor/i);
    await cerrar();
    fireEvent.click(screen.getByRole('button', { name: /124/ }));
    expect(await screen.findByRole('heading', { name: /#124/ })).toBeTruthy();
    expect(await within(screen.getByRole('dialog')).findByText('Beto Soto')).toBeTruthy();
  });
  it('muestra error de carga y nota ausente (500/404)', async () => {
    mockCaja((u) => (u.includes('/api/notas-venta/123') ? ok({}, 500) : undefined));
    await abrir(123);
    expect(await screen.findByText(/no se pudo cargar/i)).toBeTruthy();
    await cerrar();
    mockCaja((u) => (u.includes('/api/notas-venta/123') ? ok({}, 404) : undefined));
    fireEvent.click(screen.getByRole('button', { name: /123/ }));
    expect(await screen.findByText(/no encontrada/i)).toBeTruthy();
  });
  it('descarta la respuesta lenta y no pisa la nota abierta después', async () => {
    let resolver: (v: any) => void = () => {};
    const lento = new Promise((r) => { resolver = r; });
    mockCaja((u) => (u.includes('/api/notas-venta/123') ? lento : undefined));
    await abrir(123);
    expect(screen.getByRole('dialog').textContent).toMatch(/cargando/i);
    await cerrar();
    fireEvent.click(screen.getByRole('button', { name: /124/ }));
    expect((await screen.findByRole('dialog')).textContent).toContain('#124');
    await act(async () => { resolver(ok(n123)); await lento; });
    expect(screen.getByRole('dialog').textContent).toContain('#124');
    expect(screen.getByRole('dialog').textContent).not.toContain('#123');
  });
});
