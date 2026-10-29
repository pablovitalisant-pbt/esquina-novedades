/**
 * @jest-environment node
 *
 * Slice 10a: núcleo sin sesión (lib/pedidos/convertir) + usuario sistema.
 */
import { convertirPedido } from '@/lib/pedidos/convertir';
import { usuarioSistema } from '@/lib/pedidos/usuario-sistema';

const sql = jest.fn();
jest.mock('@/lib/db', () => ({ sql: (...a: any[]) => sql(...a) }));

beforeEach(() => jest.resetAllMocks());

describe('usuarioSistema', () => {
  test('resuelve por rut SISTEMA-MP', async () => {
    sql.mockResolvedValueOnce([{ id: 9, nombre: 'Mercado Pago' }]);
    expect(await usuarioSistema()).toEqual({ id: 9, nombre: 'Mercado Pago' });
    expect(sql.mock.calls[0][1]).toBe('SISTEMA-MP');
  });
  test('no existe → lanza', async () => {
    sql.mockResolvedValueOnce([]);
    await expect(usuarioSistema()).rejects.toThrow(/SISTEMA-MP/);
  });
});

describe('convertirPedido', () => {
  test('pedido inexistente → 404', async () => {
    sql.mockResolvedValueOnce([]);
    expect((await convertirPedido('x', 9, 'MP')).status).toBe(404);
  });
  test('revision / pendiente_pago no son convertibles → 409', async () => {
    for (const estado of ['revision', 'pendiente_pago']) {
      sql.mockResolvedValueOnce([{ id: 'x', estado, cliente_id: null, stock_reservado: true }]);
      expect((await convertirPedido('x', 9, 'MP')).status).toBe(409);
    }
  });
  test('pagado reservado: usa usuarioId recibido, FOR UPDATE y condición repetida', async () => {
    sql
      .mockResolvedValueOnce([{ id: 'x', estado: 'pagado', cliente_id: 'c', stock_reservado: true }])
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([{ codigo: 'A', cantidad: 2, modalidad: 'caja' }])
      .mockResolvedValueOnce([{ prenota_id: 5 }]);
    const r = await convertirPedido('x', 9, 'Mercado Pago');
    expect(r.status).toBe(201);
    expect(r.body.data).toEqual({ prenota_id: 5, convertidos: [{ codigo: 'A', cajas: 0 }], fallidos: [] });
    const cte = sql.mock.calls[3];
    const q = cte[0].join('?');
    expect(q).toContain('FOR UPDATE');
    expect(q.match(/estado = 'pagado' AND stock_reservado = true/g)).toHaveLength(2);
    expect(cte.slice(1)).toContain(9);
    expect(cte.slice(1).some((v: any) => String(v).includes('Mercado Pago'))).toBe(true);
  });
  test('reservado ya convertido por otro → 409', async () => {
    sql
      .mockResolvedValueOnce([{ id: 'x', estado: 'pagado', cliente_id: 'c', stock_reservado: true }])
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ prenota_id: null }]);
    expect((await convertirPedido('x', 9, 'MP')).status).toBe(409);
  });
});
