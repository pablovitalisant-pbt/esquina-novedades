/**
 * @jest-environment node
 *
 * Fase B — stock_minimo: E2E smoke (T5).
 *
 * Ejercita POST producto + GET alertas-stock/lista en la misma corrida,
 * inspeccionando el query text real de ambos handlers (no mockea la respuesta
 * ya calculada). Ambos endpoints comparten el mismo sqlMock.
 */

const getServerSession = jest.fn();
const sqlMock = jest.fn().mockResolvedValue([]);
const transactionMock = jest.fn();

jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));
// B2: crear con saldo > 0 usa sql.transaction (producto + ingreso inicial).
jest.mock('@/lib/db', () => {
  const s = (...args: any[]) => sqlMock(...args);
  s.transaction = (queries: any[]) => transactionMock(queries);
  return { sql: s };
});

import { POST } from '../../app/api/productos/route';
import { GET as GET_LISTA } from '../../app/api/alertas-stock/lista/route';

function getQuery(): string {
  return sqlMock.mock.calls[sqlMock.mock.calls.length - 1][0].join('');
}

describe('T5 — E2E smoke: POST producto → alertas/lista', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '1', nombre: 'QA', rol: 'admin', empresas: [1] } });
  });

  it('POST producto con stock_minimo=5 y saldo=2 → GET alertas query usa COALESCE(ub.saldo, p.saldo, 0)', async () => {
    // Paso 1: POST /api/productos — crear producto (saldo > 0 → transacción)
    sqlMock.mockResolvedValueOnce([]); // dup check
    transactionMock.mockResolvedValueOnce([
      [{ id: 100, codigo: 'E2E-SM', stock_minimo: 5, saldo: 2 }], // INSERT producto
      [{ id: 7 }],                                                // INSERT ingreso inicial
    ]);

    const postRes = await POST({
      json: () => Promise.resolve({
        codigo: 'E2E-SM', detalle: 'E2E test', costo: 10, prcventa: 30,
        stock_minimo: 5, saldo: 2,
      }),
    } as any);
    const postBody = await postRes.json();
    expect(postRes.status).toBe(201);
    expect(postBody.data.stock_minimo).toBe(5);

    // Paso 2: GET /api/alertas-stock/lista — inspeccionar query text
    // Mock para que la query devuelva algo (el handler espera rows)
    sqlMock.mockResolvedValueOnce([
      { producto_id: 100, codigo: 'E2E-SM', detalle: 'E2E test', saldo: 2, stock_minimo: 5, deficit: 3 },
    ]);
    await GET_LISTA();
    const query = getQuery();

    // La query debe tener el COALESCE corregido (con p.saldo como fallback)
    expect(query).toMatch(/COALESCE\s*\(\s*ub\.saldo\s*,\s*p\.saldo\s*,\s*0\s*\)/i);
    // La query debe buscar este producto especifico o todos los que matcheen
    expect(query).toMatch(/FROM\s+productos\s+p/i);
    // No debe tener schemas WinFac heredados
    expect(query).not.toMatch(/vida\.(itemdcto|movidcto)/i);
  });
});
