/**
 * @jest-environment node
 *
 * Slice 2c — contrato §4 tests 5 y 7: PATCH movimiento (R27 en CLP entero)
 * y reembolso sin monto_usd, moneda CLP.
 */
import { NextRequest } from 'next/server';

const getServerSession = jest.fn();
const sql = jest.fn();
jest.mock('next-auth', () => ({ getServerSession: (...a: any[]) => getServerSession(...a) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/db', () => ({ sql: (...a: any[]) => sql(...a) }));

beforeEach(() => {
  jest.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: '1', rol: 'admin', nombre: 'Admin' } });
});

describe('PATCH /api/caja/movimientos/[id] — CLP', () => {
  it('baja monto 20000→15000 con imputaciones 20000: ajusta a 15000, mensaje en CLP, sin caja_config/monto_usd', async () => {
    const { PATCH } = await import('@/app/api/caja/movimientos/[id]/route');
    sql.mockResolvedValueOnce([{ id: 'm1', tipo: 'cobro', kcodcli2: 'c1', monto: '20000.00', moneda: 'CLP', empresa: 'x' }]);
    sql.mockResolvedValueOnce([{ total: '20000.00' }]);
    sql.mockResolvedValueOnce([{ id: 7, monto_aplicado: '20000.00' }]);
    sql.mockResolvedValueOnce([]); // UPDATE nota
    sql.mockResolvedValueOnce([{ id: 'm1', monto: 15000 }]); // UPDATE mov
    const req = new NextRequest('http://localhost/x', { method: 'PATCH', body: JSON.stringify({ monto: 15000 }) });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'm1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ajuste_requerido.diferencia).toBe(5000);
    expect(body.ajuste_requerido.mensaje).toMatch(/\$5\.000/);
    expect(body.ajuste_requerido.mensaje).not.toMatch(/USD/);
    const updNota = sql.mock.calls[3];
    expect(updNota[1]).toBe(15000);
    const all = sql.mock.calls.map((c: any[]) => c[0].join(''));
    expect(all.join('')).not.toMatch(/caja_config|monto_usd|tipo_cambio/);
  });

  it('400 con monto decimal', async () => {
    const { PATCH } = await import('@/app/api/caja/movimientos/[id]/route');
    const req = new NextRequest('http://localhost/x', { method: 'PATCH', body: JSON.stringify({ monto: 10.5 }) });
    expect((await PATCH(req, { params: Promise.resolve({ id: 'm1' }) })).status).toBe(400);
  });
});
