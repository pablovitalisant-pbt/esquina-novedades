/**
 * @jest-environment node
 *
 * Fase B — Slice 35d (Reportes): total_reembolsos en resumen-cuentas y cierres
 *
 * TT1  — resumen-cuentas GET: sql debe incluir CASE 'reembolso'
 * TT2  — cierres POST: sql per-cuenta debe incluir CASE 'reembolso'
 * TT2b — cierres POST: saldoFinal con reembolsos = anterior + cobros - gastos - reembolsos (aritmetica real)
 * TT3  — resumen-cuentas sin reembolsos: no-regresion, saldo_neto igual
 *
 * TT1 — resumen-cuentas GET: SQL incluye CASE 'reembolso' y mapeo total_reembolsos
 * TT2 — cierres POST: SQL per-cuenta incluye CASE 'reembolso'
 * TT2b — cierres POST: saldoFinal = anterior + cobros - gastos - reembolsos
 * TT3 — resumen-cuentas sin reembolsos: total_reembolsos = 0, no-regresion
 *
 * Los 4 son VERDES despues de Sub-slice 4.
 */

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sql(...args),
}));

const ADMIN = { user: { id: '7', rol: 'admin', nombre: 'Admin' } };

beforeEach(() => {
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════
// TT1 — resumen-cuentas GET incluye reembolso en query
// ═══════════════════════════════════════════════════════════════════════
describe('TT1 — GET /api/caja/resumen-cuentas incluye reembolso', () => {
  it('ROJO: el SQL debe contener CASE WHEN tipo = reembolso THEN monto', async () => {
    const { GET } = await import('@/app/api/caja/resumen-cuentas/route');

    getServerSession.mockResolvedValue(ADMIN);

    sql.mockResolvedValueOnce([]);
    sql.mockResolvedValueOnce([]);

    await GET();

    const calls = sql.mock.calls;
    const sqlString = String(calls[0][0]);

    // ROJO hoy: no menciona 'reembolso' en ningun CASE
    // Verde despues: incluye CASE WHEN tipo = 'reembolso'
    expect(sqlString).toContain('reembolso');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TT2 — cierres POST incluye reembolso en query per-cuenta
// ═══════════════════════════════════════════════════════════════════════
describe('TT2 — POST /api/caja/cierres incluye reembolso', () => {
  it('ROJO: el SQL per-cuenta debe contener CASE WHEN tipo = reembolso THEN monto', async () => {
    const { POST } = await import('@/app/api/caja/cierres/route');

    getServerSession.mockResolvedValue(ADMIN);

    sql.mockResolvedValueOnce([]);                                           // ultimo cierre
    sql.mockResolvedValueOnce([{ min_fecha: '2026-01-01' }]);                // min fecha
    sql.mockResolvedValueOnce([{ total: 1 }]);                               // mov count
    sql.mockResolvedValueOnce([{ id: 1, nombre: 'Caja USD', moneda: 'USD' }]); // cuentas
    sql.mockResolvedValueOnce([{ saldo: '100' }]);                           // saldo inicial
    sql.mockResolvedValueOnce([{ total_cobros: '500', total_gastos: '50' }]); // movimientos (SIN reembolso)
    sql.mockResolvedValueOnce([{
      id: 1, fecha_desde: '2026-01-01', fecha_hasta: '2026-01-31',
      resumen: JSON.stringify([{ cuenta_id: 1, cuenta_nombre: 'Caja USD', moneda: 'USD', saldo_anterior: 100, total_cobros: 500, total_gastos: 50, saldo_final: 550 }]),
      usuario_id: 7, usuario_nombre: 'Admin', creado_por: 'Admin', created_at: '2026-01-31',
    }]);

    // Llamar al handler — puede lanzar por mock incompleto, se ignora
    try {
      await POST(new Request('http://localhost/api/caja/cierres', { method: 'POST' }));
    } catch (_) {}

    // Unica ruta: inspeccionar la query de movimientos en los calls mockeados
    const calls = sql.mock.calls;
    const movQuery = calls.find((c) => String(c[0]).includes("tipo = 'cobro'"));
    expect(movQuery).toBeDefined();
    const sqlText = String(movQuery[0]);
    // ROJO hoy: no contiene 'reembolso'
    // Verde despues: incluye CASE WHEN tipo = 'reembolso'
    expect(sqlText).toContain('reembolso');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TT2b — cierres POST: aritmetica de saldoFinal con reembolsos
// ═══════════════════════════════════════════════════════════════════════
describe('TT2b — POST /api/caja/cierres saldoFinal con reembolsos', () => {
  it('ROJO: saldoFinal = anterior + cobros - gastos - reembolsos (hoy: falta restar reembolsos)', async () => {
    const { POST } = await import('@/app/api/caja/cierres/route');

    getServerSession.mockResolvedValue(ADMIN);

    sql.mockResolvedValueOnce([]);                                           // ultimo cierre
    sql.mockResolvedValueOnce([{ min_fecha: '2026-01-01' }]);                // min fecha
    sql.mockResolvedValueOnce([{ total: 1 }]);                               // mov count
    sql.mockResolvedValueOnce([{ id: 1, nombre: 'Caja USD', moneda: 'USD' }]); // cuentas
    sql.mockResolvedValueOnce([{ saldo: '100' }]);                           // saldo inicial
    sql.mockResolvedValueOnce([{ total_cobros: '500', total_gastos: '50', total_reembolsos: '200' }]); // movs
    sql.mockResolvedValueOnce([{
      id: 1, fecha_desde: '2026-01-01', fecha_hasta: '2026-01-31',
      resumen: '[]',
      usuario_id: 7, usuario_nombre: 'Admin', creado_por: 'Admin', created_at: '2026-01-31',
    }]);

    // Llamar al handler — puede devolver response o lanzar. No importa.
    try {
      await POST(new Request('http://localhost/api/caja/cierres', { method: 'POST' }));
    } catch (_) {
      // ignorar — el handler puede lanzar por mock incompleto
    }

    // Debug: cuantos calls mockeados hay?
    expect(sql.mock.calls.length).toBe(7);

    // Unica ruta deterministica: inspeccionar los argumentos del INSERT
    const insertCall = sql.mock.calls.find((c) => String(c[0]).includes('INSERT INTO caja_cierres'));
    expect(insertCall).toBeDefined();

    // Buscar JSON.stringify(resumen) entre los valores del template (posicion 3: [fechaDesde, hoy, resumen, ...])
    const resumenJson = insertCall[3];
    expect(typeof resumenJson).toBe('string');
    expect(resumenJson).toContain('saldo_final');

    const resumen = JSON.parse(resumenJson);
    const saldoFinal = Number(resumen[0]?.saldo_final);
    expect(isNaN(saldoFinal)).toBe(false);

    // ROJO hoy: saldo_final = 100 + 500 - 50 = 550 (IGNORA reembolsos)
    // Verde despues: saldo_final = 100 + 500 - 50 - 200 = 350
    expect(saldoFinal).toBe(350);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TT3 — resumen-cuentas sin reembolsos: no-regresion
// ═══════════════════════════════════════════════════════════════════════
describe('TT3 — GET /api/caja/resumen-cuentas sin reembolsos', () => {
  it('VERDE: cuentas sin reembolsos mantienen saldo_neto igual que antes', async () => {
    const { GET } = await import('@/app/api/caja/resumen-cuentas/route');

    getServerSession.mockResolvedValue(ADMIN);

    sql.mockResolvedValueOnce([{
      cuenta_id: 1, cuenta_nombre: 'Caja USD', moneda: 'USD',
      total_cobros: '5000.00', total_gastos: '2000.00',
      total_reembolsos: '0.00',
      movimientos_neto: '3000.00',
    }]);
    sql.mockResolvedValueOnce([{ cuenta_id: 1, saldo: '1000.00' }]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);

    const cuenta = body.data[0];
    // saldo_neto = saldo_inicial + movimientos_neto = 1000 + 3000 = 4000
    expect(cuenta.saldo_neto).toBe(4000);

    // Despues del fix: total_reembolsos debe estar presente y ser 0
    expect(cuenta.total_reembolsos).toBe(0);
  });
});
