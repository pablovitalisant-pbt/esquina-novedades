/**
 * @jest-environment node
 *
 * Fase B — stock_minimo: fix de COALESCE en GET /api/alertas-stock/*.
 * R1/R2: COALESCE(ub.saldo, 0) → COALESCE(ub.saldo, p.saldo, 0)
 *
 * Tests que intentan romper:
 * - T1: CON fila ub.saldo — inspect query text (debe incluir p.saldo como fallback)
 * - T2: SIN fila ub — inspect query text (mismo requisito)
 * - safety net: passthrough del handler no se rompe
 * - smoke: 0 residual de COALESCE(ub.saldo, 0) sin p.saldo en source
 */

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));
jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sql(...args),
}));

import { GET as GET_LISTA } from '../../app/api/alertas-stock/lista/route';
import { GET as GET_COUNT } from '../../app/api/alertas-stock/route';
import fs from 'fs';
import path from 'path';

function getQuery(): string {
  const calls = sql.mock.calls;
  // sql() recibe template tags: calls[i][0] = string[], calls[i][1..n] = params
  return calls[0][0].join('');
}

// ═══════════════════════════════════════════════════════════════════
// T1: COALESCE en query de LISTA incluye p.saldo como fallback
// ═══════════════════════════════════════════════════════════════════
describe('T1 — COALESCE fix: lista query incluye p.saldo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'admin' } });
  });

  it('COALESCE en SELECT saldo incluye p.saldo como segundo fallback', async () => {
    sql.mockResolvedValue([]);
    await GET_LISTA();
    const q = getQuery();
    // Debe tener: COALESCE(ub.saldo, p.saldo, 0) AS saldo
    expect(q).toMatch(/COALESCE\s*\(\s*ub\.saldo\s*,\s*p\.saldo\s*,\s*0\s*\)/i);
  });

  it('COALESCE en deficit incluye p.saldo como segundo fallback', async () => {
    sql.mockResolvedValue([]);
    await GET_LISTA();
    const q = getQuery();
    // deficit = stock_minimo - COALESCE(ub.saldo, p.saldo, 0)
    expect(q).toMatch(/COALESCE\s*\(\s*ub\.saldo\s*,\s*p\.saldo\s*,\s*0\s*\)/i);
  });

  it('COALESCE en WHERE incluye p.saldo como segundo fallback', async () => {
    sql.mockResolvedValue([]);
    await GET_LISTA();
    const q = getQuery();
    // WHERE COALESCE(ub.saldo, p.saldo, 0) < p.stock_minimo
    expect(q).toMatch(/COALESCE\s*\(\s*ub\.saldo\s*,\s*p\.saldo\s*,\s*0\s*\)\s*<\s*p\.stock_minimo/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
// T2: COALESCE en query de COUNT incluye p.saldo como fallback
// ═══════════════════════════════════════════════════════════════════
describe('T2 — COALESCE fix: count query incluye p.saldo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'admin' } });
  });

  it('COALESCE en COUNT WHERE incluye p.saldo como segundo fallback', async () => {
    sql.mockResolvedValue([{ count: 0 }]);
    await GET_COUNT();
    const q = getQuery();
    expect(q).toMatch(/COALESCE\s*\(\s*ub\.saldo\s*,\s*p\.saldo\s*,\s*0\s*\)\s*<\s*p\.stock_minimo/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Safety nets — sin regresión (deben pasar ahora y después del fix)
// ═══════════════════════════════════════════════════════════════════
describe('Safety nets — sin regresion en passthrough', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'admin' } });
  });

  it('CON fila ub: handler devuelve ub.saldo correctamente', async () => {
    sql.mockResolvedValue([
      { producto_id: 1, codigo: 'UB-OK', detalle: 'Test', saldo: 5, stock_minimo: 10, deficit: -5 },
    ]);
    const res = await GET_LISTA();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data[0].saldo).toBe(5);
    expect(body.data[0].codigo).toBe('UB-OK');
  });

  it('SIN fila ub: handler devuelve lo que sql retorne (p.saldo)', async () => {
    sql.mockResolvedValue([
      { producto_id: 2, codigo: 'NO-UB', detalle: 'Test', saldo: 10, stock_minimo: 10, deficit: 0 },
    ]);
    const res = await GET_LISTA();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data[0].saldo).toBe(10);
  });

  it('GET count devuelve 0 cuando no hay productos con stock_minimo configurado', async () => {
    sql.mockResolvedValue([{ count: 0 }]);
    const res = await GET_COUNT();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.count).toBe(0);
  });

  it('GET lista devuelve array vacio sin productos bajo stock minimo', async () => {
    sql.mockResolvedValue([]);
    const res = await GET_LISTA();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Smoke: 0 residual de COALESCE(ub.saldo, 0) sin p.saldo
// ═══════════════════════════════════════════════════════════════════
describe('Smoke — 0 residual de COALESCE(ub.saldo, 0) sin p.saldo', () => {
  const SOURCE_FILES = [
    'app/api/alertas-stock/route.ts',
    'app/api/alertas-stock/lista/route.ts',
  ];

  it.each(SOURCE_FILES)('%s no contiene COALESCE(ub.saldo, 0) sin p.saldo', (file) => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../..', file),
      'utf-8'
    );
    // Busca COALESCE(ub.saldo, 0) que NO esté seguido de p.saldo
    const matches = content.match(/COALESCE\s*\(\s*ub\.saldo\s*,\s*0\s*\)/gi);
    expect(matches).toBeNull();
  });
});
