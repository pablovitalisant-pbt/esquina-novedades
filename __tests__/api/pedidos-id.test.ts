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
});
