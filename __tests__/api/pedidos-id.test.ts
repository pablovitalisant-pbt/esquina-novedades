/**
 * @jest-environment node
 *
 * Fase B — 3a-i: PATCH /api/pedidos/[id] (descartar).
 * Fuerza las condiciones de riesgo: 401/403, transición válida,
 * rechazo si no está pendiente (409), estado inválido (400).
 */

import { NextRequest } from 'next/server';
import { PATCH } from '@/app/api/pedidos/[id]/route';

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => {
  const mockSql = (...args: any[]) => sql(...args);
  return { sql: mockSql };
});

function patchReq(id: string, body: any): NextRequest {
  return new NextRequest(`http://localhost/api/pedidos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const CTX = { params: Promise.resolve({ id: 'pedido-1' }) };

describe('PATCH /api/pedidos/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sin sesión → 401', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await PATCH(patchReq('pedido-1', { estado: 'descartado' }), CTX);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  test('rol bodeguero → 403', async () => {
    getServerSession.mockResolvedValue({ user: { rol: 'bodeguero' } });
    const res = await PATCH(patchReq('pedido-1', { estado: 'descartado' }), CTX);
    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  test('estado inválido en body → 400 (no toca DB)', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'vendedor' } });
    const res = await PATCH(patchReq('pedido-1', { estado: 'convertido' }), CTX);
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  test('pendiente → descartado → 200', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });
    sql.mockResolvedValueOnce([{ id: 'pedido-1', estado: 'descartado' }]);

    const res = await PATCH(patchReq('pedido-1', { estado: 'descartado' }), CTX);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ id: 'pedido-1', estado: 'descartado' });
  });

  test('pedido ya no pendiente (convertido/descartado) → 409', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'vendedor' } });
    sql.mockResolvedValueOnce([]); // UPDATE con WHERE devuelve 0 filas

    const res = await PATCH(patchReq('pedido-1', { estado: 'descartado' }), CTX);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/pendiente/i);
  });

  // ─── Slice 8d: descartar un pedido con stock reservado ───────────────
  test('descartar reservado devuelve stock en la misma sentencia y nunca dos veces', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });
    let estado = 'pendiente_pago';

    // Fake DB: la sentencia nueva (CTE con pedido_items) transiciona solo si el
    // pedido sigue descartable; la sentencia vieja (solo WHERE estado='pendiente')
    // no puede descartar un reservado.
    sql.mockImplementation((...args: any[]) => {
      const q = args[0].join('');
      if (!q.includes("estado = 'descartado'")) return [];
      if (!q.includes('public.pedido_items') || !q.includes('SUM(pi.unidades)')) return [];
      if (estado !== 'pendiente_pago' && estado !== 'pagado') return [];
      estado = 'descartado';
      return [{ id: 'pedido-1', estado: 'descartado' }];
    });

    const res1 = await PATCH(patchReq('pedido-1', { estado: 'descartado' }), CTX);
    const res2 = await PATCH(patchReq('pedido-1', { estado: 'descartado' }), CTX);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(409);

    // Devolución y cambio de estado van en UNA sola sentencia: la segunda
    // llamada solo ejecuta esa sentencia y el guard la deja sin filas.
    expect(sql.mock.calls).toHaveLength(2);
    const q = sql.mock.calls[0][0].join('');
    expect(q).toContain('SUM(pi.unidades)');
    expect(q).toContain('UPDATE public.productos');
    expect(q).toContain('UPDATE public.ubicaciones_bodega');
  });

  test('la devolución solo aplica a pedidos con stock_reservado=true', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });
    let query = '';
    sql.mockImplementationOnce((...args: any[]) => {
      query = args[0].join('');
      return [{ id: 'pedido-1', estado: 'descartado' }];
    });
    const res = await PATCH(patchReq('pedido-1', { estado: 'descartado' }), CTX);
    expect(res.status).toBe(200);
    expect(query).toMatch(/stock_reservado = true/);
  });

  // Slice 8d corrección: el guard de estado va en el WHERE del propio UPDATE
  // (que toma el lock de la fila), no en un SELECT previo. Así la segunda
  // transacción espera, reevalúa y devuelve 0 filas: no hay doble devolución.
  test('el guard de estado vive en el UPDATE único (sin SELECT previo)', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });
    let query = '';
    sql.mockImplementationOnce((...args: any[]) => {
      query = args[0].join('');
      return [{ id: 'pedido-1', estado: 'descartado' }];
    });
    await PATCH(patchReq('pedido-1', { estado: 'descartado' }), CTX);
    expect(sql.mock.calls).toHaveLength(1);
    expect(query).toMatch(/UPDATE public\.pedidos[\s\S]*WHERE id = [\s\S]*AND estado IN/);
  });
});
