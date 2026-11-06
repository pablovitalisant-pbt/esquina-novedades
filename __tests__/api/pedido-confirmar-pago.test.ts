/**
 * @jest-environment node
 *
 * Fase B — N04c2: POST /api/pedidos/[id]/confirmar-pago (contrato).
 */
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/pedidos/[id]/confirmar-pago/route';
import flagsJson from '@/config/feature-flags.json';
jest.mock('next-auth', () => ({ getServerSession: (...a: any[]) => getServerSession(...a) }));
jest.mock('@/config/feature-flags.json', () => require('@/__tests__/helpers/mockFlags').mockFlags({ 'pedido-cobro-manual': true }));
jest.mock('@/lib/db', () => ({ sql: (...a: any[]) => sql(...a) }));
jest.mock('@/lib/pedidos/adquirir-pago-manual', () => ({ adquirirPagoManual: (...a: any[]) => adquirir(...a) }));
jest.mock('@/lib/pedidos/convertir', () => ({ convertirPedido: (...a: any[]) => convertir(...a) }));
jest.mock('@/lib/pedidos/cobro-pedido', () => ({ registrarCobroManualPedido: (...a: any[]) => cobrar(...a) }));
const getServerSession = jest.fn();
const sql = jest.fn();
const adquirir = jest.fn();
const convertir = jest.fn();
const cobrar = jest.fn();
const flags = flagsJson as unknown as Record<string, boolean>;
const ID = '11111111-1111-4111-8111-111111111111';
const ctx = { params: Promise.resolve({ id: ID }) };
const admin = { user: { id: '7', rol: 'admin', nombre: 'Ana' } };
const VALIDO = { cuenta_id: 3, monto: 5000, referencia: ' TRX-1 ' };
const req = (body: unknown = VALIDO, id = ID) => new NextRequest(
  `http://localhost/api/pedidos/${id}/confirmar-pago`,
  { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } },
);

describe('POST /api/pedidos/[id]/confirmar-pago', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    flags['pedido-cobro-manual'] = true;
    getServerSession.mockResolvedValue(admin);
  });
  test.each([
    ['flag apagado', false, admin, 404],
    ['sin sesión', true, null, 401],
    ['rol no admin', true, { user: { id: '7', rol: 'vendedor' } }, 403],
  ])('%s → %i', async (_n, flag, session, esperado) => {
    flags['pedido-cobro-manual'] = flag;
    getServerSession.mockResolvedValue(session);
    expect((await POST(req(), ctx)).status).toBe(esperado);
    expect(adquirir).not.toHaveBeenCalled();
  });
  test.each([
    ['UUID inválido', VALIDO, 'no-es-uuid'],
    ['monto cero', { cuenta_id: 3, monto: 0 }, ID],
    ['monto decimal', { cuenta_id: 3, monto: 1.5 }, ID],
    ['cuenta cero', { cuenta_id: 0, monto: 5000 }, ID],
    ['referencia vacía', { cuenta_id: 3, monto: 5000, referencia: '   ' }, ID],
    ['referencia >128', { cuenta_id: 3, monto: 5000, referencia: 'x'.repeat(129) }, ID],
  ])('%s → 400', async (_n, body, id) => {
    expect((await POST(req(body, id), { params: Promise.resolve({ id }) })).status).toBe(400);
    expect(adquirir).not.toHaveBeenCalled();
  });
  test('adquisición en conflicto → 409 sin convertir ni cobrar', async () => {
    adquirir.mockResolvedValue('conflicto');
    expect((await POST(req(), ctx)).status).toBe(409);
    expect(convertir).not.toHaveBeenCalled();
    expect(cobrar).not.toHaveBeenCalled();
  });
  test('éxito: adquiere, convierte, cobra y lee caja persistida → 200', async () => {
    adquirir.mockResolvedValue('adquirido');
    convertir.mockResolvedValue({ status: 201, body: { data: { prenota_id: 10 } } });
    cobrar.mockResolvedValue('registrado');
    sql.mockResolvedValue([{ id: ID, estado: 'convertido', caja_movimiento_id: 99 }]);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ID, estado: 'convertido', caja_movimiento_id: 99 });
    expect(adquirir).toHaveBeenCalledWith(expect.objectContaining({
      pedidoId: ID, cuentaId: 3, usuarioId: 7, monto: 5000, referencia: 'TRX-1',
    }));
    expect(convertir).toHaveBeenCalledWith(ID, 7, 'Ana');
    expect(cobrar).toHaveBeenCalledWith(ID);
  });
  test('caja no persistida → 502', async () => {
    adquirir.mockResolvedValue('adquirido');
    convertir.mockResolvedValue({ status: 201, body: { data: { prenota_id: 10 } } });
    cobrar.mockResolvedValue('registrado');
    sql.mockResolvedValue([{ id: ID, estado: 'convertido', caja_movimiento_id: null }]);
    expect((await POST(req(), ctx)).status).toBe(502);
  });
  test('reintento con nota ya convertida completa el cobro → 200', async () => {
    adquirir.mockResolvedValue('reintento');
    convertir.mockResolvedValue({ status: 409, body: { error: 'El pedido no está pendiente' } });
    cobrar.mockResolvedValue('ya');
    sql.mockResolvedValue([{ id: ID, estado: 'convertido', caja_movimiento_id: 99 }]);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).caja_movimiento_id).toBe(99);
    expect(cobrar).toHaveBeenCalledWith(ID);
  });
});
