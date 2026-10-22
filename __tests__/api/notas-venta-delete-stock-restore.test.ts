/**
 * @jest-environment node
 *
 * Fase B — DELETE /api/notas-venta/[id] restaura stock de items con bloqueo
 * de fila (punto 2 del panorama de riesgos).
 *
 * Antes: el SELECT de items se leia FUERA de la transaccion, y el stock se
 * restauraba desde ese valor — ventana donde un DELETE item concurrente podia
 * restaurar el mismo stock dos veces.
 *
 * Fix: UNA transaccion que bloquea la fila de prenotas FOR UPDATE y restaura
 * stock desde un GROUP BY subquery (consistente bajo el lock). El SELECT de
 * items fuera de la tx desaparece.
 */

import { NextRequest } from 'next/server';
import { DELETE } from '@/app/api/notas-venta/[id]/route';

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

// Secuencia esperada:
// 1. SELECT SUM pagos (check totalPagado) → 409 si > 0  [fuera de tx]
// 2. sql.transaction([
//      0. SELECT id FROM prenotas WHERE id=? FOR UPDATE        → lock
//      1. UPDATE prenotas SET estado='anulada' ... RETURNING id → 404 si 0 filas
//      2. UPDATE productos SET saldo = saldo + g.total_unidades FROM (GROUP BY)
//      3. UPDATE ubicaciones_bodega ... FROM (GROUP BY)
//    ])

describe('DELETE /api/notas-venta/[id] — restauracion de stock con bloqueo de fila', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    sql.mockImplementation((strings: any, ...values: any) => ({ strings, values }));
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'admin', empresas: [1] } });
  });

  it('happy path: tx con lock + updateEstado + 2 updates de stock desde GROUP BY', async () => {
    sql.mockResolvedValueOnce([{ total: '0' }]);         // 1. check pagos
    sqlTransaction.mockResolvedValueOnce([
      [{ id: 1 }],       // 0. lock
      [{ id: 1 }],       // 1. updateEstado ok
      [],                // 2. UPDATE productos
      [],                // 3. UPDATE ub_bodega
    ]);

    const res = await DELETE(new NextRequest('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);

    const txQueries = sqlTransaction.mock.calls[0][0];
    expect(txQueries).toHaveLength(4);

    const lockText = txQueries[0].strings.join('');
    expect(lockText).toMatch(/SELECT.*prenotas.*FOR UPDATE/i);

    const prodText = txQueries[2].strings.join('');
    expect(prodText).toMatch(/UPDATE.*productos.*saldo\s*=\s*p\.saldo\s*\+/i);
    expect(prodText).toMatch(/GROUP BY/i);  // restaura desde GROUP BY, no valor pre-leido

    const ubText = txQueries[3].strings.join('');
    expect(ubText).toMatch(/UPDATE.*ubicaciones_bodega/i);
  });

  it('REG: la primera query de la tx es FOR UPDATE sobre prenotas (anti doble-restore)', async () => {
    sql.mockResolvedValueOnce([{ total: '0' }]);
    sqlTransaction.mockResolvedValueOnce([[{ id: 1 }], [{ id: 1 }], [], []]);

    const res = await DELETE(new NextRequest('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);

    expect(sqlTransaction.mock.calls[0][0][0].strings.join('')).toMatch(/FOR UPDATE/i);
  });

  it('R4: updateEstado devuelve 0 filas → 404, tx corre pero no restaura', async () => {
    sql.mockResolvedValueOnce([{ total: '0' }]);   // 1. check pagos
    sqlTransaction.mockResolvedValueOnce([
      [{ id: 1 }],       // 0. lock
      [],                // 1. updateEstado 0 filas
      [],
      [],
    ]);

    const res = await DELETE(new NextRequest('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(404);
    expect(sqlTransaction).toHaveBeenCalledTimes(1);
  });

  it('sin items → tx corre con UPDATEs no-op (200) — el GROUP BY vacio no matchea', async () => {
    sql.mockResolvedValueOnce([{ total: '0' }]);
    sqlTransaction.mockResolvedValueOnce([[{ id: 1 }], [{ id: 1 }], [], []]);

    const res = await DELETE(new NextRequest('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    expect(sqlTransaction).toHaveBeenCalledTimes(1);
  });

  it('con pagos → 409, sin transaccion', async () => {
    sql.mockResolvedValueOnce([{ total: '50' }]);
    const res = await DELETE(new NextRequest('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(409);
    expect(sql.mock.calls.length).toBe(1);
    expect(sqlTransaction).not.toHaveBeenCalled();
  });

  it('sin sesion → 401', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await DELETE(new NextRequest('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(401);
  });

  it('bodeguero → 403', async () => {
    getServerSession.mockResolvedValue({ user: { rol: 'bodeguero' } });
    const res = await DELETE(new NextRequest('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(403);
  });
});
