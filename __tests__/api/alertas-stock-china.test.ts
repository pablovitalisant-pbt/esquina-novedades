/**
 * @jest-environment node
 *
 * Sub-slice 1 Backend — Fase B: tests que intentan romper.
 * Riesgos 1-4: inspeccionan SQL real → DEBEN fallar contra código actual.
 * Riesgos 5-6: safety nets → deben pasar siempre.
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
import { PUT } from '../../app/api/alertas-stock/[id]/route';

function makePutRequest(body: any) {
  return {
    json: () => Promise.resolve(body),
  } as any;
}

// ═══════════════════════════════════════════════════════════════════
// Riesgo 1: GET lista — query sin WinFac, con stock_minimo + deficit
// ═══════════════════════════════════════════════════════════════════
describe('FASE B — GET /api/alertas-stock/lista', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'admin' } });
  });

  it('R1: la query contiene stock_minimo, deficit y NOT EXISTS (hoy: vida/sanjh/total_clientes)', async () => {
    sql.mockResolvedValue([]);
    await GET_LISTA();
    const calls = sql.mock.calls;
    const query = calls[0][0].join('');

    // Debe tener los nuevos campos
    expect(query).toMatch(/stock_minimo/i);
    expect(query).toMatch(/deficit/i);
    // Debe tener NOT EXISTS contra alertas_stock_bajo (productos silenciados)
    expect(query).toMatch(/NOT\s+EXISTS[\s\S]*alertas_stock_bajo/i);
    // NO debe tener schemas WinFac
    expect(query).not.toMatch(/vida\.(itemdcto|movidcto)/i);
    expect(query).not.toMatch(/sanjh\.(itemdcto|movidcto)/i);
    expect(query).not.toMatch(/total_clientes/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Riesgo 2: GET count — query contra productos, no alertas_stock_bajo
// ═══════════════════════════════════════════════════════════════════
describe('FASE B — GET /api/alertas-stock (count)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'admin' } });
  });

  it('R2: la query consulta productos con stock_minimo y no_reponer (hoy: alertas_stock_bajo con activa)', async () => {
    sql.mockResolvedValue([{ count: 0 }]);
    await GET_COUNT();
    const calls = sql.mock.calls;
    const query = calls[0][0].join('');

    expect(query).toMatch(/FROM\s+productos/i);
    expect(query).toMatch(/stock_minimo/i);
    expect(query).toMatch(/no_reponer/i);
    // NO debe usar la columna legacy activa
    expect(query).not.toMatch(/\bactiva\b/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Riesgo 3: PUT ignorar — INSERT con ON CONFLICT, no UPDATE activa
// ═══════════════════════════════════════════════════════════════════
describe('FASE B — PUT /api/alertas-stock/[id] ignorar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'admin' } });
  });

  it('R3: ignorar hace INSERT INTO alertas_stock_bajo con ON CONFLICT (hoy: UPDATE activa=false)', async () => {
    sql.mockResolvedValue([]);
    const req = makePutRequest({ accion: 'ignorar' });
    await PUT(req, { params: Promise.resolve({ id: '42' }) });
    const calls = sql.mock.calls;
    const query = calls[0][0].join('');

    expect(query).toMatch(/INSERT\s+INTO\s+alertas_stock_bajo/i);
    expect(query).toMatch(/ON\s+CONFLICT/i);
    expect(query).not.toMatch(/UPDATE\s+alertas_stock_bajo/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Riesgo 4: PUT no_reponer — UPDATE productos directo, sin SELECT previo
// ═══════════════════════════════════════════════════════════════════
describe('FASE B — PUT /api/alertas-stock/[id] no_reponer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'admin' } });
  });

  it('R4: no_reponer hace UPDATE productos SET no_reponer=true WHERE id=$1 (hoy: SELECT+UPDATE con codigo)', async () => {
    sql.mockResolvedValue([]);
    const req = makePutRequest({ accion: 'no_reponer' });
    await PUT(req, { params: Promise.resolve({ id: '42' }) });
    const calls = sql.mock.calls;

    // No debe hacer SELECT previo a alertas_stock_bajo
    const allQueries = calls.map((c: any) => c[0].join('')).join('\n');
    expect(allQueries).not.toMatch(/SELECT.*FROM\s+alertas_stock_bajo/i);

    // Debe hacer UPDATE productos SET no_reponer = true WHERE id = ...
    const updateQuery = calls.find((c: any) => c[0].join('').includes('UPDATE'));
    expect(updateQuery).toBeDefined();
    const updateStr = updateQuery[0].join('');
    expect(updateStr).toMatch(/UPDATE\s+productos\s+SET\s+no_reponer\s*=\s*true/i);
    expect(updateStr).toMatch(/WHERE\s+id\s*=/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Riesgo 5: 401 sin sesión (safety net — debe pasar ahora y después)
// ═══════════════════════════════════════════════════════════════════
describe('FASE B — auth (safety net)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('R5: GET lista retorna 401 sin sesión', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET_LISTA();
    expect(res.status).toBe(401);
  });

  it('GET count retorna 401 sin sesión', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET_COUNT();
    expect(res.status).toBe(401);
  });

  it('PUT retorna 401 sin sesión', async () => {
    getServerSession.mockResolvedValue(null);
    const req = makePutRequest({ accion: 'ignorar' });
    const res = await PUT(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Riesgo 6: stock_minimo NULL → 0 resultados (safety net)
// ═══════════════════════════════════════════════════════════════════
describe('FASE B — sin falsos positivos (safety net)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'admin' } });
  });

  it('R6: GET count devuelve 0 cuando no hay productos con stock_minimo configurado', async () => {
    sql.mockResolvedValue([{ count: 0 }]);
    const res = await GET_COUNT();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.count).toBe(0);
  });

  it('GET lista devuelve array vacío cuando no hay productos bajo stock mínimo', async () => {
    sql.mockResolvedValue([]);
    const res = await GET_LISTA();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// BUG-007: Alertas deben usar ubicaciones_bodega.saldo, no productos.saldo
// ═══════════════════════════════════════════════════════════════════
describe('BUG-007 — fuente de saldo es ubicaciones_bodega, no productos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'admin' } });
  });

  // ─── Test 1: LEFT JOIN ubicaciones_bodega ──────────────────
  it('la query de lista hace LEFT JOIN a ubicaciones_bodega por codigo + empresa_id', async () => {
    sql.mockResolvedValue([]);
    await GET_LISTA();
    const calls = sql.mock.calls;
    const query = calls[0][0].join('');

    // Debe hacer LEFT JOIN a ubicaciones_bodega
    expect(query).toMatch(/LEFT\s+JOIN\s+ubicaciones_bodega/i);
    // Debe incluir COALESCE para productos sin fila
    expect(query).toMatch(/COALESCE/i);
    // Debe joinear por codigo (no solo id)
    expect(query).toMatch(/ub\.codigo\s*=\s*p\.codigo/i);
  });

  // ─── Test 2: count también usa ubicaciones_bodega ──────────
  it('la query de count también hace LEFT JOIN a ubicaciones_bodega', async () => {
    sql.mockResolvedValue([{ count: 0 }]);
    await GET_COUNT();
    const calls = sql.mock.calls;
    const query = calls[0][0].join('');

    expect(query).toMatch(/LEFT\s+JOIN\s+ubicaciones_bodega/i);
    expect(query).toMatch(/COALESCE/i);
  });

  // ─── Test 3: join incluye empresa_id (evitar cruce SJ-/VD-) ──
  it('el JOIN de lista incluye empresa_id para no cruzar SJ- con VD-', async () => {
    sql.mockResolvedValue([]);
    await GET_LISTA();
    const calls = sql.mock.calls;
    const query = calls[0][0].join('');

    expect(query).toMatch(/ub\.empresa_id\s*=\s*p\.empresa_id/i);
  });
});
