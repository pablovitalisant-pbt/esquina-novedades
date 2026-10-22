/**
 * @jest-environment node
 *
 * Slice 10c: registrarCobroPedido + máquina de estados del pago aprobado.
 */
import { registrarCobroPedido } from '@/lib/pedidos/cobro-pedido';
import { pagoAprobado } from '@/lib/pedidos/pago-aprobado';
import { convertirPedido } from '@/lib/pedidos/convertir';

const sql = jest.fn();
jest.mock('@/lib/db', () => ({ sql: (...a: any[]) => sql(...a) }));
jest.mock('@/lib/pedidos/convertir', () => ({ convertirPedido: jest.fn() }));
jest.mock('@/lib/pedidos/usuario-sistema', () => ({
  usuarioSistema: async () => ({ id: 9, nombre: 'Mercado Pago' }),
}));

const q = (c: any[]) => c[0].join('?');
const pago = { id: 777, transaction_amount: 5000, currency_id: 'CLP' };
let claim: any[];

// Despacha por texto de la sentencia.
function setup(estado: string, extra: any = {}, cuenta: any[] = [{ valor: '3' }]) {
  claim = [{ estado, total: 5000, caja_movimiento_id: null, ...extra }];
  sql.mockImplementation(async (...c: any[]) => {
    const t = q(c);
    if (t.includes('SET mp_payment_id')) return claim;
    if (t.includes('FROM caja_config')) return cuenta;
    if (t.includes('INSERT INTO caja_movimientos')) return [{ id: 'mov-1' }];
    if (t.includes("SET estado = 'pagado'")) return [{ id: 'x' }];
    return [];
  });
  (convertirPedido as jest.Mock).mockResolvedValue({ status: 201, body: { data: { prenota_id: 5 } } });
}
const sqls = () => sql.mock.calls.map(q);
const hubo = (frag: string) => sqls().some((t) => t.includes(frag));

beforeEach(() => {
  sql.mockReset();
  (convertirPedido as jest.Mock).mockReset();
});

describe('registrarCobroPedido', () => {
  test('crea cobro en la cuenta configurada, forma_pago mercadopago, usuario sistema', async () => {
    setup('convertido');
    expect(await registrarCobroPedido('p1', '777')).toBe('registrado');
    const c = sql.mock.calls.find((x) => q(x).includes('INSERT INTO caja_movimientos'))!;
    const t = q(c);
    expect(t).toContain('FOR UPDATE');
    expect(t).toContain('LEAST');
    expect(t).toContain('caja_movimiento_notas');
    expect(t).toContain('caja_movimiento_id IS NULL');
    expect(t).toContain("'mercadopago'");
    expect(c.slice(1)).toEqual(expect.arrayContaining([3, 9]));
  });
  test('0 filas (ya registrado) → "ya", idempotente', async () => {
    sql.mockImplementation(async (...c: any[]) => (q(c).includes('FROM caja_config') ? [{ valor: '3' }] : []));
    expect(await registrarCobroPedido('p1', '777')).toBe('ya');
  });
  test('sin mp_cuenta_id → sin_cuenta y no inserta', async () => {
    setup('convertido', {}, []);
    expect(await registrarCobroPedido('p1', '777')).toBe('sin_cuenta');
    expect(hubo('INSERT INTO caja_movimientos')).toBe(false);
  });
});

describe('pagoAprobado', () => {
  test('pendiente_pago + monto ok → pagado → convertir (usuario sistema) → cobro', async () => {
    setup('pendiente_pago');
    await pagoAprobado('p1', pago);
    expect(sqls().some((t) => t.includes("SET estado = 'pagado'") && t.includes("estado = 'pendiente_pago'"))).toBe(true);
    expect(convertirPedido).toHaveBeenCalledWith('p1', 9, 'Mercado Pago');
    expect(hubo('caja_movimiento_notas')).toBe(true);
  });
  test('pagado (reintento) → convertir y cobro', async () => {
    setup('pagado');
    await pagoAprobado('p1', pago);
    expect(convertirPedido).toHaveBeenCalledTimes(1);
    expect(hubo('caja_movimiento_notas')).toBe(true);
  });
  test('convertido sin cobro → solo cobro', async () => {
    setup('convertido');
    await pagoAprobado('p1', pago);
    expect(convertirPedido).not.toHaveBeenCalled();
    expect(hubo('caja_movimiento_notas')).toBe(true);
  });
  test('convertido con cobro ya hecho → no-op (doble ejecución)', async () => {
    setup('convertido', { caja_movimiento_id: 'mov-1' });
    await pagoAprobado('p1', pago);
    expect(convertirPedido).not.toHaveBeenCalled();
    expect(hubo('caja_movimiento_notas')).toBe(false);
  });
  test.each(['expirado', 'rechazado'])('%s + approved → pagado_tardio, sin stock ni nota', async (e) => {
    setup(e);
    await pagoAprobado('p1', pago);
    expect(sqls().some((t) => t.includes("'pagado_tardio'") && t.includes("estado IN ('expirado', 'rechazado')"))).toBe(true);
    expect(convertirPedido).not.toHaveBeenCalled();
    expect(hubo('productos')).toBe(false);
    expect(hubo('caja_movimiento_notas')).toBe(false);
  });
  test.each(['pagado_tardio', 'revision'])('%s → no-op', async (e) => {
    setup(e);
    await pagoAprobado('p1', pago);
    expect(sql).toHaveBeenCalledTimes(1); // solo el claim
    expect(convertirPedido).not.toHaveBeenCalled();
  });
  test.each(['pendiente', 'descartado'])('%s → revision (pedido no online)', async (e) => {
    setup(e);
    await pagoAprobado('p1', pago);
    expect(sqls().some((t) => t.includes("estado = 'revision'"))).toBe(true);
    expect(convertirPedido).not.toHaveBeenCalled();
  });
  test('monto distinto → revision con motivo, sin convertir ni cobrar', async () => {
    setup('pendiente_pago');
    await pagoAprobado('p1', { ...pago, transaction_amount: 4999 });
    const c = sql.mock.calls.find((x) => q(x).includes("estado = 'revision'"))!;
    expect(c.slice(1).some((v: any) => typeof v === 'string' && /4999/.test(v))).toBe(true);
    expect(convertirPedido).not.toHaveBeenCalled();
    expect(hubo('caja_movimiento_notas')).toBe(false);
  });
  test('moneda distinta → revision', async () => {
    setup('pendiente_pago');
    await pagoAprobado('p1', { ...pago, currency_id: 'USD' });
    expect(sqls().some((t) => t.includes("estado = 'revision'"))).toBe(true);
    expect(convertirPedido).not.toHaveBeenCalled();
  });
  test('segundo payment id (claim 0 filas) → revision, sin cobro', async () => {
    setup('convertido');
    claim = [];
    await pagoAprobado('p1', pago);
    expect(sqls().some((t) => t.includes("estado = 'revision'"))).toBe(true);
    expect(hubo('caja_movimiento_notas')).toBe(false);
  });
  test('sin mp_cuenta_id: queda convertido, sin cobro, con motivo', async () => {
    setup('pendiente_pago', {}, []);
    await pagoAprobado('p1', pago);
    expect(convertirPedido).toHaveBeenCalled();
    expect(hubo('INSERT INTO caja_movimientos')).toBe(false);
    const c = sql.mock.calls.find((x) => q(x).includes('SET mp_revision_motivo'))!;
    expect(q(c)).not.toContain("estado = 'revision'");
    expect(c.slice(1).some((v: any) => typeof v === 'string' && /mp_cuenta_id/.test(v))).toBe(true);
  });
  test('doble ejecución: convertir 409 y relectura convertido → cobra una vez, sin revision', async () => {
    setup('pendiente_pago');
    (convertirPedido as jest.Mock).mockResolvedValue({ status: 409, body: { error: 'ya convertido' } });
    const base = sql.getMockImplementation()!;
    sql.mockImplementation(async (...c: any[]) =>
      q(c).includes('SELECT estado FROM pedidos') ? [{ estado: 'convertido' }] : base(...c)
    );
    await pagoAprobado('p1', pago);
    expect(sqls().some((t) => t.includes("estado = 'revision'"))).toBe(false);
    expect(sqls().filter((t) => t.includes('INSERT INTO caja_movimientos'))).toHaveLength(1);
  });
  test('marcarRevision excluye convertido y solo anota motivo', async () => {
    setup('pendiente_pago', {}, []);
    await pagoAprobado('p1', { ...pago, currency_id: 'USD' });
    const rev = sql.mock.calls.find((x) => q(x).includes("estado = 'revision'"))!;
    expect(q(rev)).toContain("'convertido'");
    expect(hubo("estado = 'convertido'")).toBe(true);
  });
  test('convertir falla (no 201) → revision, sin cobro', async () => {
    setup('pendiente_pago');
    (convertirPedido as jest.Mock).mockResolvedValue({ status: 409, body: { error: 'x' } });
    await pagoAprobado('p1', pago);
    expect(sqls().some((t) => t.includes("estado = 'revision'"))).toBe(true);
    expect(hubo('INSERT INTO caja_movimientos')).toBe(false);
  });
});
