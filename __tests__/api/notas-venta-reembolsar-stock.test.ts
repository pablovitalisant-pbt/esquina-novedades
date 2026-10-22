/**
 * @jest-environment node
 *
 * Fase B — POST /api/notas-venta/[id]/reembolsar restaura stock con bloqueo
 * de fila (punto 2 del panorama de riesgos).
 *
 * Antes: los items se leian FUERA de la transaccion (itemGroups) y el stock se
 * restauraba desde ese valor — ventana donde un DELETE item concurrente podia
 * restaurar el mismo stock dos veces.
 *
 * Fix: agregar SELECT ... FOR UPDATE sobre prenotas al inicio de la tx y
 * restaurar stock desde un GROUP BY subquery (consistente bajo el lock). La
 * lectura de itemGroups fuera de la tx desaparece.
 */

import { POST } from '@/app/api/notas-venta/[id]/reembolsar/route';

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

const makeReq = (body?: any) => new Request('http://localhost', {
  method: 'POST',
  body: body ? JSON.stringify(body) : JSON.stringify({}),
});

const MOCK_PAGOS = [
  { monto_aplicado: '50', movimiento_id: 1, cuenta_id: 1, moneda: 'USD', monto: '50', monto_usd: '50', tipo_cambio: null, forma_pago: 'efectivo', kcodcli2: null, nombre_cliente: 'Test' },
];

// Secuencia esperada de la transaccion (Fase C):
// 0. SELECT id FROM prenotas WHERE id=? FOR UPDATE   → lock (NUEVO)
// 1. guard TOCTOU 1/COUNT
// 2..n. pares (INSERT movimiento + INSERT vinculo) por pago
// n+1. UPDATE productos ... FROM (GROUP BY)
// n+2. UPDATE ubicaciones_bodega ... FROM (GROUP BY)
// n+3. UPDATE estado='anulada'

describe('POST /api/notas-venta/[id]/reembolsar — restauracion de stock con bloqueo de fila', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    sql.mockImplementation((strings: any, ...values: any) => ({ strings, values }));
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'admin', nombre: 'Admin', empresas: [1] } });
  });

  it('happy path: tx con lock FOR UPDATE + guard + pairs + stock desde GROUP BY', async () => {
    sql.mockResolvedValueOnce(MOCK_PAGOS);   // 1. Leer pagos (fuera de tx)

    // tx: [lock, guard, pair1, updateProd, updateUb, updateEstado] (1 pago)
    sqlTransaction.mockResolvedValueOnce([
      [{ id: 1 }],          // 0. lock
      [{ guard: 1 }],       // 1. guard
      [{ movimiento_id: 1 }], // 2. pair 1
      [],                   // 3. UPDATE productos
      [],                   // 4. UPDATE ubicaciones_bodega
      [],                   // 5. UPDATE estado
    ]);

    const res = await POST(makeReq(), { params: Promise.resolve({ id: '1' }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.reembolsos).toHaveLength(1);

    const txQueries = sqlTransaction.mock.calls[0][0];
    expect(txQueries).toHaveLength(6);

    const lockText = txQueries[0].strings.join('');
    expect(lockText).toMatch(/SELECT.*prenotas.*FOR UPDATE/i);

    const stockQueries = txQueries.filter((q: any) => {
      const text = q.strings?.join('') || '';
      return text.includes('UPDATE') && (text.includes('productos') || text.includes('ubicaciones_bodega'));
    });
    expect(stockQueries).toHaveLength(2);
    const prodQuery = stockQueries.find((q: any) => (q.strings?.join('') || '').includes('productos'));
    expect(prodQuery.strings.join('')).toMatch(/GROUP BY/i);  // restaura desde GROUP BY, no valor pre-leido
  });

  it('REG: la primera query de la tx es FOR UPDATE sobre prenotas (anti doble-restore)', async () => {
    sql.mockResolvedValueOnce(MOCK_PAGOS);
    sqlTransaction.mockResolvedValueOnce([
      [{ id: 1 }], [{ guard: 1 }], [{ movimiento_id: 1 }], [], [], [],
    ]);

    const res = await POST(makeReq(), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    expect(sqlTransaction.mock.calls[0][0][0].strings.join('')).toMatch(/FOR UPDATE/i);
  });

  it('sin items → stock UPDATEs presentes pero no-op (GROUP BY vacio no matchea)', async () => {
    sql.mockResolvedValueOnce(MOCK_PAGOS);
    sqlTransaction.mockResolvedValueOnce([
      [{ id: 1 }], [{ guard: 1 }], [{ movimiento_id: 1 }], [], [], [],
    ]);

    const res = await POST(makeReq(), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);

    const txQueries = sqlTransaction.mock.calls[0][0];
    const stockQueries = txQueries.filter((q: any) => {
      const text = q.strings?.join('') || '';
      return text.includes('UPDATE') && (text.includes('productos') || text.includes('ubicaciones_bodega'));
    });
    // Los 2 UPDATEs de stock siempre estan en la tx (no-op si el grupo es vacio).
    expect(stockQueries).toHaveLength(2);
  });

  it('guard TOCTOU dispara → 409, todo se revierte', async () => {
    sql.mockResolvedValueOnce(MOCK_PAGOS);
    sqlTransaction.mockRejectedValueOnce({ code: '22012' });

    const res = await POST(makeReq(), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(409);
  });

  it('sin sesion → 401', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(makeReq(), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(401);
  });

  it('bodeguero → 403', async () => {
    getServerSession.mockResolvedValue({ user: { rol: 'bodeguero' } });
    const res = await POST(makeReq(), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(403);
  });

  it('sin pagos → 400', async () => {
    sql.mockResolvedValueOnce([]);  // pagos vacio
    const res = await POST(makeReq(), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
  });
});
