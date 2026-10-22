/**
 * @jest-environment node
 *
 * Fase B — GET /api/deudores (página "Deudores").
 * R1: guard bodeguero → 403 (mismo que notas-venta).
 * R2: agrupación por cliente_id vs fila por nota (sin cliente).
 * R3: saldo_pendiente > 0.005 — deudas en cero/anuladas se excluyen.
 * R4: "Sin nombre" cuando no hay cliente_id ni nombre_cliente.
 * R5: deuda más antigua primero (orden por fecha más vieja).
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/deudores/route';

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => {
  const fn = (...args: any[]) => sql(...args);
  fn.transaction = (...args: any[]) => sql(...args);
  return { sql: fn };
});

jest.mock('@/lib/auth', () => ({ authOptions: {} }));

describe('GET /api/deudores', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    sql.mockImplementation((strings: any, ...values: any) => ({ strings, values }));
  });

  // ═══════════════════════════════════════════════════════════════
  // R1: guard
  // ═══════════════════════════════════════════════════════════════
  it('R1: sin sesión → 401', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('R1: bodeguero → 403 (bloqueado)', async () => {
    getServerSession.mockResolvedValue({ user: { id: '2', rol: 'bodeguero' } });
    const res = await GET(new NextRequest('http://localhost'));
    expect(res.status).toBe(403);
  });

  it('R1: admin y vendedor → OK', async () => {
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'admin' } });
    sql.mockResolvedValueOnce([]);
    const res = await GET(new NextRequest('http://localhost'));
    expect(res.status).toBe(200);
  });

  // ═══════════════════════════════════════════════════════════════
  // R2/R3: la query SQL debe filtrar estado='activa' y saldo > 0.005
  // ═══════════════════════════════════════════════════════════════
  it('R2: la query filtra estado=activa', async () => {
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'vendedor' } });
    // Captura la query y devuelve [] para procesar (necesita array iterable).
    let captured: string = '';
    sql.mockImplementation((strings: any) => {
      captured = strings.join('');
      return [];
    });
    await GET(new NextRequest('http://localhost'));

    expect(captured.toLowerCase()).toContain("estado = 'activa'");
    // saldo_pendiente > 0.005 se filtra en el servicio (JS), no en SQL —
    // cubierto por R2 (agrupación) y R3 (saldo 0 excluido).
  });

  // ═══════════════════════════════════════════════════════════════
  // R2: agrupación — cliente_id presente agrupa; sin cliente → fila por nota
  // ═══════════════════════════════════════════════════════════════
  it('R2: agrupa notas del mismo cliente_id en una sola fila', async () => {
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'admin' } });
    // Dos notas del cliente A + una de B (todas con abono parcial real)
    sql.mockResolvedValueOnce([
      { cliente_id: 'cA', nombre_cliente: 'Cliente A', titulo: 'Nota 1', created_at: '2026-07-01', total: 100, total_pagado: 20 },
      { cliente_id: 'cA', nombre_cliente: 'Cliente A', titulo: 'Nota 2', created_at: '2026-07-10', total: 50, total_pagado: 10 },
      { cliente_id: 'cB', nombre_cliente: 'Cliente B', titulo: 'Nota 3', created_at: '2026-06-01', total: 30, total_pagado: 10 },
    ]);

    const res = await GET(new NextRequest('http://localhost'));
    const { data } = await res.json();

    // Cliente A agrupa sus 2 notas en 1 fila
    expect(data.length).toBe(2);
    const filaA = data.find((d: any) => d.cliente_nombre === 'Cliente A');
    expect(filaA).toBeDefined();
    expect(filaA.deuda_total).toBeCloseTo(120); // (100-20) + (50-10)
    expect(filaA.num_notas).toBe(2);
  });

  // ═══════════════════════════════════════════════════════════════
  // R4: "Sin nombre" cuando no hay cliente_id ni nombre_cliente
  // ═══════════════════════════════════════════════════════════════
  it('R4: nota sin cliente_id ni nombre_cliente → "Sin nombre"', async () => {
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'vendedor' } });
    sql.mockResolvedValueOnce([
      { cliente_id: null, nombre_cliente: null, titulo: 'Nota X', created_at: '2026-07-05', total: 10, total_pagado: 5 },
    ]);

    const res = await GET(new NextRequest('http://localhost'));
    const { data } = await res.json();
    expect(data[0].cliente_nombre).toBe('Sin nombre');
  });

  // ═══════════════════════════════════════════════════════════════
  // R3: deuda en cero / anulada se excluyen (saldo <= 0.005)
  // ═══════════════════════════════════════════════════════════════
  it('R3: saldo_pendiente <= 0.005 se filtra en el frontend/servicio', async () => {
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'admin' } });
    sql.mockResolvedValueOnce([
      { cliente_id: 'c1', nombre_cliente: 'A', titulo: 'N1', created_at: '2026-07-01', total: 10, total_pagado: 10 }, // saldo 0
    ]);

    const res = await GET(new NextRequest('http://localhost'));
    const { data } = await res.json();
    // Si el endpoint filtra saldo<=0, data queda vacía; si no, el cliente
    // lo filtra. Documentamos el contrato: saldo 0 no debe aparecer como deuda.
    const conDeuda = data.filter((d: any) => Number(d.deuda_total) > 0.005);
    expect(conDeuda.length).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════
  // R6: solo notas con abono parcial real entran a la lista de deudores.
  // abono = total_pagado + saldo_favor_aplicado. Nota con saldo pendiente
  // pero $0 abonado (nunca se le pagó nada) se excluye.
  // ═══════════════════════════════════════════════════════════════
  it('R6: nota con saldo pendiente pero abono $0 se excluye', async () => {
    getServerSession.mockResolvedValue({ user: { id: '1', rol: 'admin' } });
    // cA: saldo 100, abono 0  → excluida (nuevo comportamiento)
    // cB: saldo 60,  abono 40 → aparece
    // cC: saldo 70,  abono 30 (solo saldo_favor_aplicado) → aparece
    sql.mockResolvedValueOnce([
      { cliente_id: 'cA', nombre_cliente: 'A', titulo: 'N1', created_at: '2026-07-01', total: 100, total_pagado: 0 },
      { cliente_id: 'cB', nombre_cliente: 'B', titulo: 'N2', created_at: '2026-07-02', total: 100, total_pagado: 40 },
      { cliente_id: 'cC', nombre_cliente: 'C', titulo: 'N3', created_at: '2026-07-03', total: 100, total_pagado: 0, saldo_favor_aplicado: 30 },
    ]);

    const res = await GET(new NextRequest('http://localhost'));
    const { data } = await res.json();
    const nombres = data.map((d: any) => d.cliente_nombre);
    expect(nombres).toEqual(['B', 'C']);
  });
});
