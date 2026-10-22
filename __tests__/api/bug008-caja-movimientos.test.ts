/**
 * @jest-environment node
 *
 * BUG-008 — kcodcli2 vs cliente_id en Caja Mayor.
 * El GET y POST de movimientos/route.ts retornan kcodcli2 sin alias,
 * pero la interfaz CajaMovimiento declara cliente_id. El modal de edición
 * lee mov.cliente_id → siempre undefined → cliente se pierde al editar.
 *
 * Fix (Opción B): m.kcodcli2::bigint AS cliente_id en SELECT y RETURNING.
 *
 * Tests:
 * 1. GET — verifica que el SQL contiene "AS cliente_id" (alias)
 * 2. POST — verifica que el RETURNING contiene "AS cliente_id"
 */

const getServerSession = jest.fn();
const sqlMock = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sqlMock(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────
// Test 1: GET — alias AS cliente_id en SELECT
// ─────────────────────────────────────────────────────────────────────
describe('BUG-008 — GET /api/caja/movimientos', () => {
  test('ROJO: SELECT debe contener alias "AS cliente_id" para kcodcli2', async () => {
    const { GET } = await import('@/app/api/caja/movimientos/route');

    getServerSession.mockResolvedValue({
      user: { id: '1', rol: 'admin', nombre: 'Admin' },
    });

    // Mock: movimientos + counts
    sqlMock.mockResolvedValueOnce([]); // SELECT movimientos
    sqlMock.mockResolvedValueOnce([{ count: '0' }]); // SELECT count

    const req = { url: 'http://localhost/api/caja/movimientos' } as Request;
    await GET(req);

    // Verifica que el SQL del primer llamado (SELECT de movimientos) contiene el alias
    const calls = sqlMock.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);

    const selectCall = calls[0];
    const sqlString = String(selectCall[0]);
    expect(sqlString).toContain('AS cliente_id');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Test 2: POST — alias AS cliente_id en RETURNING
// ─────────────────────────────────────────────────────────────────────
describe('BUG-008 — POST /api/caja/movimientos', () => {
  test('ROJO: RETURNING debe contener alias "AS cliente_id" para kcodcli2', async () => {
    const { POST } = await import('@/app/api/caja/movimientos/route');

    getServerSession.mockResolvedValue({
      user: { id: '1', rol: 'admin', nombre: 'Admin' },
    });

    // Mock: check prenotas (kcodcli2=5 + empresa='bazar-naty')
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }]);
    // Mock: INSERT INTO caja_movimientos ... RETURNING
    sqlMock.mockResolvedValueOnce([{
      id: 1, fecha: '2026-07-05', tipo: 'cobro',
      kcodcli2: '5', nombre_cliente: 'Test Cliente',
      cuenta_id: 1, moneda: 'USD', monto: 100, monto_usd: 100,
      tipo_cambio: 980.5, forma_pago: 'efectivo',
      observaciones: null, empresa: 'bazar-naty', es_credito: false,
      usuario_id: 1, usuario_nombre: 'Admin',
      created_at: '2026-07-05', updated_at: '2026-07-05',
    }]);

    const req = {
      json: async () => ({
        fecha: '2026-07-05',
        tipo: 'cobro',
        kcodcli2: '5',
        nombre_cliente: 'Test Cliente',
        cuenta_id: 1,
        moneda: 'USD',
        monto: 100,
        forma_pago: 'efectivo',
        empresa: 'bazar-naty',
      }),
    } as Request;

    await POST(req);

    // Busca la llamada que contiene INSERT INTO caja_movimientos
    const calls = sqlMock.mock.calls;
    const insertCall = calls.find(c => String(c[0]).includes('INSERT INTO caja_movimientos'));
    expect(insertCall).toBeDefined();

    const sqlString = String(insertCall![0]);
    expect(sqlString).toContain('AS cliente_id');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Test 3: PATCH — alias AS cliente_id en RETURNING
// ─────────────────────────────────────────────────────────────────────
describe('BUG-008 — PATCH /api/caja/movimientos/[id]', () => {
  test('ROJO: RETURNING del PATCH debe contener alias "AS cliente_id" para kcodcli2', async () => {
    const { PATCH } = await import('@/app/api/caja/movimientos/[id]/route');

    getServerSession.mockResolvedValue({
      user: { id: '1', rol: 'admin', nombre: 'Admin' },
    });

    // Mock 1: SELECT current movement (handler necesita el estado actual)
    sqlMock.mockResolvedValueOnce([{
      id: 1, fecha: '2026-07-05', tipo: 'cobro',
      kcodcli2: '5', nombre_cliente: 'Test Cliente',
      cuenta_id: 1, moneda: 'ARS', monto: 200, monto_usd: 0.20,
      tipo_cambio: 980.5, forma_pago: 'efectivo',
      observaciones: null, empresa: 'bazar-naty', es_credito: false,
      usuario_id: 1, usuario_nombre: 'Admin',
    }]);
    // Mock 2: dolar_dia from caja_config (moneda=ARS → recalcula monto_usd)
    sqlMock.mockResolvedValueOnce([{ valor: '980.5' }]);
    // Mock 3: UPDATE ... RETURNING
    sqlMock.mockResolvedValueOnce([{
      id: 1, fecha: '2026-07-05', tipo: 'cobro',
      kcodcli2: '5', nombre_cliente: 'Test Cliente',
      cuenta_id: 1, moneda: 'ARS', monto: 100, monto_usd: 0.10,
      tipo_cambio: 980.5, forma_pago: 'efectivo',
      observaciones: null, empresa: 'bazar-naty', es_credito: false,
      usuario_id: 1, usuario_nombre: 'Admin',
      created_at: '2026-07-05', updated_at: '2026-07-05',
    }]);

    const req = {
      json: async () => ({
        fecha: '2026-07-05',
        tipo: 'cobro',
        moneda: 'ARS',
        monto: 100,
        cuenta_id: 1,
        kcodcli2: '5',
        nombre_cliente: 'Test Cliente',
      }),
    } as Request;

    await PATCH(req, { params: Promise.resolve({ id: '1' }) });

    // Busca la llamada que contiene UPDATE caja_movimientos
    const calls = sqlMock.mock.calls;
    const updateCall = calls.find(c => String(c[0]).includes('UPDATE caja_movimientos'));
    expect(updateCall).toBeDefined();

    const sqlString = String(updateCall![0]);
    expect(sqlString).toContain('AS cliente_id');
  });
});
