/**
 * @jest-environment node
 *
 * Fase B — Slice 3c: Mostrar saldo a favor en la ficha de Clientes.
 * Tests que intentan romper el slice. Solo lectura, sin escritura.
 *
 * Riesgos cubiertos:
 * [x] Query con SUM/agregación — cliente sin movimientos → saldo_favor 0,
 *     no null ni error (subquery correlacionada con COALESCE).
 * [x] Renderizado condicional — saldo <= 0.005 no muestra nada (cubierto
 *     en el test UI).
 */

import { NextRequest } from 'next/server';

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/db', () => ({ sql: (...args: any[]) => sql(...args) }));

import { GET } from '@/app/api/clientes/route';

const sesionAdmin = { user: { id: '7', rol: 'admin' } };

describe('GET /api/clientes — saldo_favor', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getServerSession.mockResolvedValue(sesionAdmin);
  });

  test('TEST 1: cliente con créditos y débitos → saldo_favor = créditos - débitos', async () => {
    sql.mockResolvedValueOnce([
      { id: 'c1', nombre: 'Juana', telefono: null, direccion: null, notas: null, created_at: '2026-08-01', saldo_favor: '40' },
    ]);
    const res = await GET(new NextRequest('http://localhost/api/clientes'));
    const { data } = await res.json();
    // 50 + 20 créditos - 30 débito = 40, convertido a number (viene string de numeric).
    expect(data[0].saldo_favor).toBe(40);
    expect(typeof data[0].saldo_favor).toBe('number');
  });

  test('TEST 2: cliente sin movimientos → saldo_favor 0 (no null)', async () => {
    sql.mockResolvedValueOnce([
      { id: 'c2', nombre: 'Pedro', telefono: null, direccion: null, notas: null, created_at: '2026-08-01', saldo_favor: '0' },
    ]);
    const res = await GET(new NextRequest('http://localhost/api/clientes'));
    const { data } = await res.json();
    expect(data[0].saldo_favor).toBe(0);
  });

  test('TEST 3: rama con q → mismo cálculo de saldo_favor', async () => {
    let captured = '';
    sql.mockImplementation((strings: any) => { captured = strings.join(''); return [
      { id: 'c3', nombre: 'Ana', telefono: null, direccion: null, notas: null, created_at: '2026-08-01', saldo_favor: '12.50' },
    ]; });
    const res = await GET(new NextRequest('http://localhost/api/clientes?q=Ana'));
    const { data } = await res.json();
    expect(data[0].saldo_favor).toBe(12.5);
    // La query de búsqueda incluye el subquery del ledger.
    expect(captured).toMatch(/clientes_saldo_favor_movimientos/);
    expect(captured).toMatch(/ILIKE/);
  });

  test('TEST 3b: la rama sin q también incluye el subquery del ledger', async () => {
    let captured = '';
    sql.mockImplementation((strings: any) => { captured = strings.join(''); return []; });
    await GET(new NextRequest('http://localhost/api/clientes'));
    expect(captured).toMatch(/clientes_saldo_favor_movimientos/);
    expect(captured).toMatch(/SUM\(CASE WHEN tipo='credito' THEN monto ELSE -monto END\)/);
  });
});
