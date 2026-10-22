/**
 * @jest-environment node
 *
 * FASE B — Slice "notas-venta-pagar-desde-lista"
 * Test 1: GET /api/notas-venta con agregados (total, total_pagado, saldo_pendiente)
 * Debe fallar en ROJO — los agregados no existen aún en la ruta.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ROUTE_PATH = 'app/api/notas-venta/route.ts';

describe('GET /api/notas-venta — agregados por nota', () => {
  // ─── Smoke: la ruta existe ───
  test('el archivo de ruta existe', () => {
    const fullPath = path.join(PROJECT_ROOT, ROUTE_PATH);
    expect(fs.existsSync(fullPath)).toBe(true);
  });

  test('la ruta importa sql desde lib/db', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, ROUTE_PATH), 'utf-8');
    expect(content).toMatch(/from.*lib\/db/);
  });

  // ─── La ruta exporta GET ───
  test('la ruta exporta GET', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, ROUTE_PATH), 'utf-8');
    expect(content).toMatch(/\bexport\s+async\s+function\s+GET\b/);
  });

  // ─── El SELECT incluye los agregados ───
  test('[QUERY AGREGADA] el SELECT incluye total, total_pagado y saldo_pendiente', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, ROUTE_PATH), 'utf-8');
    expect(content).toMatch(/total/i);
    expect(content).toMatch(/total_pagado|totalPagado/i);
    expect(content).toMatch(/saldo_pendiente|saldoPendiente/i);
  });
});

/**
 * Test de integración con sql mockeado.
 * Verifica que 2 notas con distinta cantidad de items/pagos
 * devuelvan sus propios totales sin mezclarse.
 */
describe('GET /api/notas-venta — integración con mock sql', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  test('[QUERY AGREGADA] 2 notas del mismo usuario: cada una devuelve su total sin mezclarse', async () => {
    // Mock de dependencias
    jest.mock('next-auth', () => ({
      getServerSession: () => Promise.resolve({ user: { id: '7', rol: 'admin' } }),
    }));
    jest.mock('@/lib/auth', () => ({ authOptions: {} }));

    // Mock sql: retorna 2 notas con sus agregados
    const mockSql = jest.fn().mockResolvedValue([
      {
        id: 1,
        titulo: 'Nota de Venta #1',
        total: '100.00',
        total_pagado: '30.00',
        saldo_pendiente: '70.00',
      },
      {
        id: 2,
        titulo: 'Nota de Venta #2',
        total: '45.00',
        total_pagado: '0',
        saldo_pendiente: '45.00',
      },
    ]);
    jest.mock('@/lib/db', () => ({ sql: mockSql }));

    const { GET } = await import('@/app/api/notas-venta/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);

    // Nota 1: 3 items, total 100, pagado 30, saldo 70
    expect(body.data[0].id).toBe(1);
    expect(Number(body.data[0].total)).toBeCloseTo(100, 2);
    expect(Number(body.data[0].total_pagado)).toBeCloseTo(30, 2);
    expect(Number(body.data[0].saldo_pendiente)).toBeCloseTo(70, 2);

    // Nota 2: 1 item, total 45, sin pagos
    expect(body.data[1].id).toBe(2);
    expect(Number(body.data[1].total)).toBeCloseTo(45, 2);
    expect(Number(body.data[1].total_pagado)).toBeCloseTo(0, 2);
    expect(Number(body.data[1].saldo_pendiente)).toBeCloseTo(45, 2);
  });
});
