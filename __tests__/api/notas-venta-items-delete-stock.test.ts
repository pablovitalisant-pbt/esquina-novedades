/**
 * @jest-environment node
 *
 * Fase B — DELETE /api/notas-venta/[id]/items/[itemId] — restauracion de stock
 * con bloqueo de fila (punto 2 del panorama de riesgos).
 *
 * La race: DELETE item restauraba stock en 5 sentencias sueltas sin lock,
 * mientras anulacion/reembolso leian el mismo item fuera de su transaccion —
 * podia restaurarse el stock del mismo item dos veces.
 *
 * Fix: UNA transaccion que primero bloquea la fila de prenotas FOR UPDATE y
 * restaura stock desde el propio item via subquery. Un mock no puede probar la
 * serializacion real de concurrencia; el proxy testable es que la tx adquiera
 * el lock FOR UPDATE como primera query y valide con guard 1/COUNT (22012).
 */

import { NextRequest } from 'next/server';
import { DELETE as DELETE_ITEM } from '@/app/api/notas-venta/[id]/items/[itemId]/route';

const getServerSession = jest.fn();
const sql = jest.fn();
const sqlTransaction = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => {
  const fn = (...args: any[]) => sql(...args);
  fn.transaction = (...args: any[]) => sqlTransaction(...args);
  return { sql: fn };
});

jest.mock('@/lib/auth', () => ({ authOptions: {} }));

// Secuencia esperada de la transaccion (Fase C):
// 0. SELECT id FROM prenotas WHERE id=? FOR UPDATE   → lock de fila
// 1. SELECT 1/COUNT(...) guard                        → aborta (22012) si no aplica
// 2. UPDATE productos SET saldo = saldo + it.unidades FROM (item)
// 3. UPDATE ubicaciones_bodega ... FROM (item)
// 4. DELETE FROM prenota_items WHERE id=?
// En fallo del guard: catch → SELECT estado diagnostico → 404/422.

describe('DELETE /api/notas-venta/[id]/items/[itemId] — restauracion de stock con bloqueo de fila', () => {
  let diagRows: any = null;
  beforeEach(() => {
    jest.resetAllMocks();
    diagRows = null;
    sql.mockImplementation((strings: any, ...values: any) => {
      const text = strings.join('');
      // Query de diagnostico en el catch (tras guard 22012) → devuelve estado real.
      if (/SELECT estado FROM public\.prenotas/i.test(text)) return diagRows;
      return { strings, values };  // queries que construyen la transaccion
    });
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'vendedor', empresas: [1] } });
  });

  it('happy path: transaccion con lock + guard + restore + delete', async () => {
    sqlTransaction.mockResolvedValueOnce([{ id: 1 }, { guard: 1 }, [], [], []]);

    const res = await DELETE_ITEM(
      new NextRequest('http://localhost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1', itemId: '5' }) }
    );
    expect(res.status).toBe(200);

    const txQueries = sqlTransaction.mock.calls[0][0];
    expect(txQueries).toHaveLength(5);

    const prodText = txQueries[2].strings.join('');
    expect(prodText).toMatch(/UPDATE.*productos.*saldo\s*=\s*p\.saldo\s*\+/i);
    // El stock se restaura DESDE el propio item (subquery), no con un valor pre-leido afuera del lock.
    expect(prodText).toMatch(/FROM.*prenota_items/i);

    const ubText = txQueries[3].strings.join('');
    expect(ubText).toMatch(/UPDATE.*ubicaciones_bodega/i);
    expect(ubText).not.toMatch(/INSERT/i);

    const delText = txQueries[4].strings.join('');
    expect(delText).toMatch(/DELETE.*prenota_items.*WHERE.*id/i);
  });

  it('REG: la primera query de la tx es FOR UPDATE sobre prenotas (anti doble-restore)', async () => {
    sqlTransaction.mockResolvedValueOnce([{ id: 1 }, { guard: 1 }, [], [], []]);

    const res = await DELETE_ITEM(
      new NextRequest('http://localhost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1', itemId: '5' }) }
    );
    expect(res.status).toBe(200);

    const lockText = sqlTransaction.mock.calls[0][0][0].strings.join('');
    expect(lockText).toMatch(/SELECT.*prenotas.*FOR UPDATE/i);
  });

  it('nota anulada → guard aborta (22012) → 422, no restaura stock ni borra item', async () => {
    sqlTransaction.mockRejectedValueOnce({ code: '22012' });
    diagRows = [{ estado: 'anulada' }];  // SELECT diagnostico

    const res = await DELETE_ITEM(
      new NextRequest('http://localhost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1', itemId: '5' }) }
    );
    expect(res.status).toBe(422);
    expect(sqlTransaction).toHaveBeenCalledTimes(1);
  });

  it('item no encontrado → 22012 → 404', async () => {
    sqlTransaction.mockRejectedValueOnce({ code: '22012' });
    diagRows = [{ estado: 'activa' }];  // SELECT diagnostico

    const res = await DELETE_ITEM(
      new NextRequest('http://localhost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1', itemId: '5' }) }
    );
    expect(res.status).toBe(404);
  });

  it('nota no encontrada → 22012 → 404', async () => {
    sqlTransaction.mockRejectedValueOnce({ code: '22012' });
    diagRows = [];  // SELECT diagnostico vacio

    const res = await DELETE_ITEM(
      new NextRequest('http://localhost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1', itemId: '5' }) }
    );
    expect(res.status).toBe(404);
  });

  it('sin sesion → 401', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await DELETE_ITEM(
      new NextRequest('http://localhost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1', itemId: '5' }) }
    );
    expect(res.status).toBe(401);
  });

  it('bodeguero → 403', async () => {
    getServerSession.mockResolvedValue({ user: { rol: 'bodeguero' } });
    const res = await DELETE_ITEM(
      new NextRequest('http://localhost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1', itemId: '5' }) }
    );
    expect(res.status).toBe(403);
  });
});
