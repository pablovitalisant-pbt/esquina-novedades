/**
 * @jest-environment node
 *
 * Fase B — Slice 10b: GET/PATCH /api/caja/config (solo clave mp_cuenta_id, admin).
 */
import { NextRequest } from 'next/server';

const sql = jest.fn();
const getServerSession = jest.fn();

jest.mock('@/lib/db', () => ({ sql: (...a: any[]) => sql(...a) }));
jest.mock('next-auth', () => ({ getServerSession: (...a: any[]) => getServerSession(...a) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));

import { GET, PATCH } from '@/app/api/caja/config/route';

const patch = (body: any) => new NextRequest('http://localhost/api/caja/config', {
  method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
});
const admin = { user: { rol: 'admin', nombre: 'Ana' } };
let cuentas: any[];
let config: any[];

beforeEach(() => {
  jest.clearAllMocks();
  getServerSession.mockResolvedValue(admin);
  cuentas = [{ id: 3 }];
  config = [{ valor: '3' }];
  sql.mockImplementation((s: any) => {
    const q = s.join('');
    if (q.includes('FROM public.caja_cuentas')) return cuentas;
    if (q.includes('FROM public.caja_config')) return config;
    return [];
  });
});

const writes = () => sql.mock.calls.filter(c => c[0].join('').includes('INSERT'));

describe('GET /api/caja/config', () => {
  test('sin sesión → 401; no admin → 403', async () => {
    getServerSession.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
    getServerSession.mockResolvedValueOnce({ user: { rol: 'vendedor' } });
    expect((await GET()).status).toBe(403);
  });

  test('devuelve mp_cuenta_id numérico o null', async () => {
    expect((await (await GET()).json()).data).toEqual({ mp_cuenta_id: 3 });
    config = [];
    expect((await (await GET()).json()).data).toEqual({ mp_cuenta_id: null });
  });
});

describe('PATCH /api/caja/config', () => {
  test('no admin → 403 sin escribir', async () => {
    getServerSession.mockResolvedValueOnce({ user: { rol: 'vendedor' } });
    expect((await PATCH(patch({ mp_cuenta_id: 3 }))).status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  test.each([[{}], [{ mp_cuenta_id: 'x' }], [{ mp_cuenta_id: -1 }], [{ mp_cuenta_id: 1.5 }], [{ otra: 1 }]])(
    'body inválido %j → 400 sin escribir', async (body) => {
      expect((await PATCH(patch(body))).status).toBe(400);
      expect(writes()).toHaveLength(0);
    });

  test('cuenta inexistente o inactiva → 400 sin escribir', async () => {
    cuentas = [];
    expect((await PATCH(patch({ mp_cuenta_id: 99 }))).status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  test('cuenta activa → upsert de mp_cuenta_id y 200', async () => {
    const res = await PATCH(patch({ mp_cuenta_id: 3 }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ mp_cuenta_id: 3 });
    expect(writes()).toHaveLength(1);
    expect(writes()[0][0].join('')).toContain("'mp_cuenta_id'");
  });
});
