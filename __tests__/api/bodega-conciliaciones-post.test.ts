/**
 * @jest-environment node
 *
 * Fase B — Conciliación de Stock: POST /api/bodega/conciliaciones
 *
 * Contrato:
 * - Sesión requerida + rol !== 'admin' → 403 (a diferencia de /api/ingresos,
 *   que admite cualquier rol, aquí es admin-only: es una sobrescritura de
 *   productos.saldo).
 * - Body: { codigo, fisico_cajas, fisico_unidades, observaciones? }
 * - empresa_id se deriva de session.user.empresas[0] (single-tenant).
 * - Transacción atómica: INSERT conciliaciones_stock (auditoría) + UPDATE
 *   productos SET saldo = fisicoTotal + UPDATE ubicaciones_bodega con
 *   diferencia = 0.
 * - Respuesta: { data: { codigo, saldo_anterior, saldo_nuevo, diferencia } }
 *
 * Riesgos cubiertos (deben fallar en la implementación incorrecta):
 * - sin sesión → 401
 * - vendedor/bodeguero → 403
 * - codigo faltante → 400
 * - fisico_cajas / fisico_unidades inválidos (negativo, no entero) → 400
 * - producto inexistente → 404
 * - el UPDATE de productos debe ser saldo = fisicoTotal (ABS), no saldo+delta.
 * - diferencia = fisicoTotal - saldo_anterior (no 0 en la respuesta).
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/bodega/conciliaciones/route';

const getServerSession = jest.fn();
const sql = jest.fn();
const mockTransaction = jest.fn(async (queries: any[]) => queries.map(() => []));
(sql as any).transaction = mockTransaction;

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => {
  const s = (...args: any[]) => (sql as any)(...args);
  s.transaction = (queries: any[]) => mockTransaction(queries);
  return { sql: s };
});

const makeReq = (body: any) => new NextRequest('http://localhost', {
  method: 'POST', body: JSON.stringify(body),
});

const BASE_BODY = { codigo: 'P001', fisico_cajas: 3, fisico_unidades: 2 };

// producto existente: packing 10 U/caja, saldo 20 → 3 cajas + 2 sueltas = 32
const MOCK_PRODUCTO = [{ codigo: 'P001', empresa_id: 1, cantcaja: 10, saldo: 20 }];

describe('POST /api/bodega/conciliaciones', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '1', nombre: 'Pablo', rol: 'admin', empresas: [1] } });
    sql.mockReset();
    mockTransaction.mockReset();
    sql.mockImplementation((...args: any[]) => args);
    sql.mockImplementationOnce(() => MOCK_PRODUCTO);
    mockTransaction.mockResolvedValue([[], [], []]);
  });

  // ═══════════════════════════════════════════════════════════════
  // Auth
  // ═══════════════════════════════════════════════════════════════
  it('sin sesión → 401, sin tocar la DB', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(makeReq(BASE_BODY));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('admin → 200', async () => {
    const res = await POST(makeReq(BASE_BODY));
    expect(res.status).toBe(200);
  });

  it('vendedor → 403', async () => {
    getServerSession.mockResolvedValue({ user: { id: '1', nombre: 'V', rol: 'vendedor', empresas: [1] } });
    const res = await POST(makeReq(BASE_BODY));
    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  it('bodeguero → 403', async () => {
    getServerSession.mockResolvedValue({ user: { id: '1', nombre: 'B', rol: 'bodeguero', empresas: [1] } });
    const res = await POST(makeReq(BASE_BODY));
    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════
  // Validación de body
  // ═══════════════════════════════════════════════════════════════
  it('codigo faltante → 400', async () => {
    const { codigo, ...sinCodigo } = BASE_BODY;
    const res = await POST(makeReq(sinCodigo));
    expect(res.status).toBe(400);
  });

  it('fisico_cajas negativo → 400', async () => {
    const res = await POST(makeReq({ ...BASE_BODY, fisico_cajas: -1 }));
    expect(res.status).toBe(400);
  });

  it('fisico_cajas no entero → 400', async () => {
    const res = await POST(makeReq({ ...BASE_BODY, fisico_cajas: 2.5 }));
    expect(res.status).toBe(400);
  });

  it('fisico_unidades negativo → 400', async () => {
    const res = await POST(makeReq({ ...BASE_BODY, fisico_unidades: -1 }));
    expect(res.status).toBe(400);
  });

  // ═══════════════════════════════════════════════════════════════
  // Producto inexistente
  // ═══════════════════════════════════════════════════════════════
  it('producto inexistente → 404, sin tocar la transacción', async () => {
    sql.mockReset();
    sql.mockImplementation(() => []);
    const res = await POST(makeReq(BASE_BODY));
    expect(res.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════
  // Transacción atómica (3 queries: INSERT + UPDATE productos + UPDATE ub)
  // ═══════════════════════════════════════════════════════════════
  it('la transacción tiene INSERT auditoría + UPDATE productos + UPDATE ubicaciones', async () => {
    const res = await POST(makeReq(BASE_BODY));
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const [q1, q2, q3] = mockTransaction.mock.calls[0][0];

    const insertSql = q1[0].join('');
    expect(insertSql).toMatch(/INSERT INTO public\.conciliaciones_stock/i);

    const updateProductos = q2[0].join('');
    expect(updateProductos).toMatch(/UPDATE public\.productos/i);

    const updateUb = q3[0].join('');
    expect(updateUb).toMatch(/UPDATE public\.ubicaciones_bodega/i);
    expect(updateUb).toMatch(/diferencia\s*=\s*0/i);
  });

  it('UPDATE productos es saldo = fisicoTotal (ABS), no saldo+delta', async () => {
    await POST(makeReq(BASE_BODY));
    const [, q2] = mockTransaction.mock.calls[0][0];
    const up = q2[0].join('');
    // Es un SET absoluto al conteo físico (fisicoTotal), NO saldo = saldo + delta.
    expect(up).toMatch(/saldo\s*=/i);
    expect(up).not.toMatch(/saldo\s*=\s*saldo/i);
    // El valor interpolado es fisicoTotal (32), no un incremento.
    expect(Number(q2[1])).toBe(32);
  });

  it('diferencia = fisicoTotal - saldo_anterior y va en la auditoría', async () => {
    await POST(makeReq(BASE_BODY));
    const [q1] = mockTransaction.mock.calls[0][0];
    // q1 = [strings, empresa_id, codigo, saldo_anterior, saldo_nuevo, diferencia, cantcaja, fisico_cajas, fisico_unidades, ...]
    expect(q1[1]).toBe(1);    // empresa_id
    expect(q1[2]).toBe('P001'); // codigo
    expect(q1[3]).toBe(20);   // saldo_anterior
    expect(q1[4]).toBe(32);   // saldo_nuevo
    expect(q1[5]).toBe(12);   // diferencia
    expect(q1[6]).toBe(10);   // cantcaja
    expect(q1[7]).toBe(3);    // fisico_cajas
    expect(q1[8]).toBe(2);    // fisico_unidades
  });

  it('respuesta trae { data: { codigo, saldo_anterior, saldo_nuevo, diferencia } }', async () => {
    const res = await POST(makeReq(BASE_BODY));
    const json = await res.json();
    expect(json).toEqual({
      data: { codigo: 'P001', saldo_anterior: 20, saldo_nuevo: 32, diferencia: 12 },
    });
  });

  it('usuario_id, usuario_nombre y observaciones van en la auditoría', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', nombre: 'Naty', rol: 'admin', empresas: [1] } });
    await POST(makeReq({ ...BASE_BODY, observaciones: 'Sobrantes en bodega' }));
    const [q1] = mockTransaction.mock.calls[0][0];
    expect(q1).toContain(7);
    expect(q1).toContain('Naty');
    expect(q1).toContain('Sobrantes en bodega');
  });
});
