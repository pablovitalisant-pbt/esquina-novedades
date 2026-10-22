/**
 * @jest-environment node
 *
 * Fase B — Ingreso de Mercadería: POST /api/ingresos
 *
 * Contrato:
 * - Cualquier rol autenticado (admin, bodeguero, vendedor), sin 403.
 * - Body: { codigo, cantidad, cantcaja_nuevo?, observaciones? }
 * - empresa_id se deriva de session.user.empresas[0] (single-tenant).
 * - Transacción atómica: INSERT ingresos_mercaderia + UPDATE productos
 *   SET saldo = saldo + $cantidad (incremento atómico, NO lectura-escritura)
 *   + UPDATE ubicaciones_bodega SET saldo = saldo + $cantidad.
 *
 * Riesgos cubiertos (deben fallar en la implementación incorrecta):
 * - cantidad ≤ 0 o no numérica → 400
 * - producto inexistente → 404
 * - cantcaja_nuevo inválido (0, negativo, no entero) → 400
 * - sin sesión → 401
 * - el UPDATE de saldo debe ser saldo = saldo + $delta (dos ingresos
 *   simultáneos no se pisan).
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/ingresos/route';

const getServerSession = jest.fn();
const sql = jest.fn();
const mockTransaction = jest.fn(async (queries: any[]) => queries.map(() => []));
(sql as any).transaction = mockTransaction;

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

// El factory de jest.mock se hoistea sobre las declaraciones, así que solo
// referencia sql/mockTransaction de forma perezosa (al invocarse), no al
// evaluar el factory. sql.transaction delega a mockTransaction.
jest.mock('@/lib/db', () => {
  const s = (...args: any[]) => (sql as any)(...args);
  s.transaction = (queries: any[]) => mockTransaction(queries);
  return { sql: s };
});

const makeReq = (body: any) => new NextRequest('http://localhost', {
  method: 'POST', body: JSON.stringify(body),
});

const BASE_BODY = { codigo: 'Gl81249-1', cantidad: 200, observaciones: 'Partida agosto' };

// producto existente: packing actual 12 U/caja
const MOCK_PRODUCTO = [{ codigo: 'Gl81249-1', empresa_id: 1, cantcaja: 12, saldo: 504 }];

describe('POST /api/ingresos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '1', nombre: 'Pablo', rol: 'admin', empresas: [1] } });
    sql.mockReset();
    mockTransaction.mockReset();
    // Las queries de la transacción se inspeccionan desde sus propios args:
    // sql\`...\` devuelve [strings, ...valores]. La 1ra llamada (SELECT del
    // producto) usa mockImplementationOnce para devolver la fila.
    sql.mockImplementation((...args: any[]) => args);
    sql.mockImplementationOnce(() => MOCK_PRODUCTO);
    mockTransaction.mockResolvedValue([[], [], []]);
  });

  // ═══════════════════════════════════════════════════════════════
  // Auth
  // ═══════════════════════════════════════════════════════════════
  it('sin sesión → 401', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(makeReq(BASE_BODY));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('admin → 200', async () => {
    const res = await POST(makeReq(BASE_BODY));
    expect(res.status).toBe(200);
  });

  it('vendedor → 200 (no 403)', async () => {
    getServerSession.mockResolvedValue({ user: { id: '1', nombre: 'V', rol: 'vendedor', empresas: [1] } });
    const res = await POST(makeReq(BASE_BODY));
    expect(res.status).toBe(200);
  });

  it('bodeguero → 200 (el contrato NO excluye bodeguero)', async () => {
    getServerSession.mockResolvedValue({ user: { id: '1', nombre: 'B', rol: 'bodeguero', empresas: [1] } });
    const res = await POST(makeReq(BASE_BODY));
    expect(res.status).toBe(200);
  });

  // ═══════════════════════════════════════════════════════════════
  // cantidad inválida
  // ═══════════════════════════════════════════════════════════════
  it('cantidad = 0 → 400', async () => {
    const res = await POST(makeReq({ ...BASE_BODY, cantidad: 0 }));
    expect(res.status).toBe(400);
  });

  it('cantidad negativa → 400', async () => {
    const res = await POST(makeReq({ ...BASE_BODY, cantidad: -5 }));
    expect(res.status).toBe(400);
  });

  it('cantidad no numérica → 400', async () => {
    const res = await POST(makeReq({ ...BASE_BODY, cantidad: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('cantidad faltante → 400', async () => {
    const { cantidad, ...sinCantidad } = BASE_BODY;
    const res = await POST(makeReq(sinCantidad));
    expect(res.status).toBe(400);
  });

  it('cantidad no entera → 400', async () => {
    const res = await POST(makeReq({ ...BASE_BODY, cantidad: 10.5 }));
    expect(res.status).toBe(400);
  });

  // ═══════════════════════════════════════════════════════════════
  // cantcaja_nuevo inválido
  // ═══════════════════════════════════════════════════════════════
  it('cantcaja_nuevo = 0 → 400', async () => {
    const res = await POST(makeReq({ ...BASE_BODY, cantcaja_nuevo: 0 }));
    expect(res.status).toBe(400);
  });

  it('cantcaja_nuevo negativo → 400', async () => {
    const res = await POST(makeReq({ ...BASE_BODY, cantcaja_nuevo: -1 }));
    expect(res.status).toBe(400);
  });

  it('cantcaja_nuevo no entero → 400', async () => {
    const res = await POST(makeReq({ ...BASE_BODY, cantcaja_nuevo: 3.7 }));
    expect(res.status).toBe(400);
  });

  // ═══════════════════════════════════════════════════════════════
  // producto inexistente
  // ═══════════════════════════════════════════════════════════════
  it('producto inexistente → 404, sin tocar la transacción', async () => {
    sql.mockReset();
    sql.mockImplementation(() => []); // SELECT del producto devuelve vacío
    const res = await POST(makeReq(BASE_BODY));
    expect(res.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════
  // Incremento atómico (R principal: dos ingresos simultáneos no se pisan)
  // ═══════════════════════════════════════════════════════════════
  it('UPDATE productos es saldo = saldo + $cantidad (no lectura previa)', async () => {
    const res = await POST(makeReq(BASE_BODY));
    expect(res.status).toBe(200);

    // La transacción recibe 3 queries: INSERT + UPDATE productos + UPDATE ub_bodega
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const [q1, q2, q3] = mockTransaction.mock.calls[0][0];

    const insertSql = q1[0].join('');
    expect(insertSql).toMatch(/INSERT INTO public\.ingresos_mercaderia/i);

    const updateProductos = q2[0].join('');
    // Debe ser incremento relativo, NO un SET con valor pre-leído:
    expect(updateProductos).toMatch(/UPDATE public\.productos/i);
    expect(updateProductos).toMatch(/saldo\s*=\s*saldo\s*\+/i);
    expect(updateProductos).not.toMatch(/saldo\s*=\s*504/i); // no hardcodear saldo leído
    // El delta interpolado es la cantidad (200)
    const deltaIdx = updateProductos.indexOf('+') + 1;
    expect(Number(q2[1])).toBe(200);

    const updateUb = q3[0].join('');
    expect(updateUb).toMatch(/UPDATE public\.ubicaciones_bodega/i);
    expect(updateUb).toMatch(/saldo\s*=\s*saldo\s*\+/i);
  });

  it('sin cambio de packing → cantcaja_cambio=false y cantcaja_registrado = packing actual', async () => {
    await POST(makeReq(BASE_BODY));
    const [q1] = mockTransaction.mock.calls[0][0];
    const params = q1;
    // INSERT: (empresa_id, codigo, cantidad, cantcaja_registrado, cantcaja_cambio, ...)
    expect(params[1]).toBe(1);            // empresa_id
    expect(params[2]).toBe('Gl81249-1');  // codigo
    expect(params[3]).toBe(200);          // cantidad
    expect(params[4]).toBe(12);           // cantcaja_registrado = packing actual
    expect(params[5]).toBe(false);        // cantcaja_cambio = false
  });

  it('con cantcaja_nuevo distinto → cantcaja_cambio=true, registra el nuevo y UPDATE productos lo aplica', async () => {
    const res = await POST(makeReq({ ...BASE_BODY, cantcaja_nuevo: 24 }));
    expect(res.status).toBe(200);

    const [q1, q2] = mockTransaction.mock.calls[0][0];
    expect(q1[4]).toBe(24);   // cantcaja_registrado = nuevo
    expect(q1[5]).toBe(true); // cantcaja_cambio = true

    // UPDATE productos setea cantcaja con CASE WHEN; el valor 24 va como
    // parámetro. q2 params: [cantidad, cambioPacking, cantcajaRegistrado, ...]
    const up = q2[0].join('');
    expect(up).toMatch(/cantcaja\s*=/i);
    expect(Number(q2[3])).toBe(24);
  });

  it('con cantcaja_nuevo IGUAL al actual → cantcaja_cambio=false, no toca cantcaja', async () => {
    const res = await POST(makeReq({ ...BASE_BODY, cantcaja_nuevo: 12 }));
    expect(res.status).toBe(200);
    const [q1] = mockTransaction.mock.calls[0][0];
    expect(q1[4]).toBe(12);
    expect(q1[5]).toBe(false);
  });

  it('usuario_id y usuario_nombre vienen de la sesión', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', nombre: 'Naty', rol: 'admin', empresas: [1] } });
    await POST(makeReq(BASE_BODY));
    const [q1] = mockTransaction.mock.calls[0][0];
    // usuario_id, usuario_nombre al final de los params del INSERT
    expect(q1).toContain(7);
    expect(q1).toContain('Naty');
  });

  it('observaciones se inserta', async () => {
    await POST(makeReq({ ...BASE_BODY, observaciones: 'Proveedor cambio la caja a 24u' }));
    const [q1] = mockTransaction.mock.calls[0][0];
    expect(q1).toContain('Proveedor cambio la caja a 24u');
  });
});
