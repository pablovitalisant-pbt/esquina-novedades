/**
 * @jest-environment node
 *
 * BUG-010: caja/cierres — saldoAnterior = 0 es centinela Y valor de negocio
 *
 * Causa raíz: `let saldoAnterior = 0` como centinela es ambiguo — no se
 * distingue "no encontró la cuenta" (null) de "el valor real es 0".
 *
 * Fix (3 partes, decisión de negocio Pablo 2026-07-06):
 *   1. Centinela: 0 → null (desambigua)
 *   2. Eliminar query N+1 ultimoCierreConCuenta dentro del loop
 *      (reutilizar ultimoCierre externo, que ahora trae resumen)
 *   3. Eliminar el bloque de scan de cierres viejos: cuando la cuenta
 *      no está en el último cierre → saldo_inicial directo.
 */

const getServerSession = jest.fn();
const sqlMock = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sqlMock(...args),
}));

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

let POST: typeof import('@/app/api/caja/cierres/route').POST;

beforeAll(async () => {
  if (typeof (global as any).Request === 'undefined') {
    (global as any).Request = class Request {};
  }
  if (typeof (global as any).Response === 'undefined') {
    (global as any).Response = class Response {};
  }
  const mod = await import('@/app/api/caja/cierres/route');
  POST = mod.POST;
});

beforeEach(() => {
  sqlMock.mockClear();
  getServerSession.mockClear();
});

// Helper: extrae el resumen que el handler serializó en la llamada INSERT
async function extraerResumenInsert(): Promise<any[]> {
  const calls = sqlMock.mock.calls;
  const insertCall = calls.find((args: any[]) => {
    const template = typeof args[0] === 'string' ? args[0] : args[0]?.[0] || '';
    return template.includes('INSERT INTO caja_cierres');
  });
  expect(insertCall).toBeDefined();
  const insertArgs = (insertCall as any[]).slice(1);
  const resumenStr = insertArgs.find(
    (v: any) => typeof v === 'string' && v.includes('saldo_anterior')
  );
  expect(resumenStr).toBeDefined();
  return JSON.parse(resumenStr as string);
}

describe('BUG-010: saldo_anterior correcto', () => {
  test('[Escenario A] saldo_final=0 en último cierre → saldo_anterior=0 (centinela null)', async () => {
    getServerSession.mockResolvedValue({
      user: { id: '1', rol: 'admin', nombre: 'Admin Test' },
    });

    // Con el fix, ultimoCierre incluye resumen
    sqlMock.mockResolvedValueOnce([{
      fecha_hasta: '2026-07-04',
      resumen: [{
        cuenta_id: 1, cuenta_nombre: 'Caja Principal', moneda: 'ARS',
        saldo_anterior: 100, total_cobros: 0, total_gastos: 100, saldo_final: 0,
      }],
    }]);
    sqlMock.mockResolvedValueOnce([{ total: 1 }]);
    sqlMock.mockResolvedValueOnce([
      { id: 1, nombre: 'Caja Principal', moneda: 'ARS' },
    ]);
    // cuenta encontrada en último cierre → saldoAnterior=0 → null check FALSE
    // No se consulta saldo_inicial, no hay scan
    sqlMock.mockResolvedValueOnce([{ total_cobros: '0', total_gastos: '0' }]);
    sqlMock.mockResolvedValueOnce([{
      id: 1, fecha_desde: '2026-07-05', fecha_hasta: '2026-07-06',
      resumen: [], usuario_id: 1, usuario_nombre: 'Admin Test',
      creado_por: 'Admin Test', created_at: '2026-07-06T00:00:00.000Z',
    }]);

    const req = { json: async () => ({}) } as Request;
    const res = await POST(req);
    expect(res.status).toBe(201);

    const resumenCalculado = await extraerResumenInsert();
    const cuentaCaja = resumenCalculado.find((r: any) => r.cuenta_id === 1);
    // Con centinela null: saldoAnterior=0 (valor real) no entra al scan.
    // Sin fix: centinela 0 entraba al scan que encontraba 200.
    expect(cuentaCaja.saldo_anterior).toBe(0);
  });

  test('[Escenario B] cuenta no está en último cierre → saldo_inicial=200, sin scan', async () => {
    getServerSession.mockResolvedValue({
      user: { id: '1', rol: 'admin', nombre: 'Admin Test' },
    });

    // Con el fix, ultimoCierre incluye resumen
    sqlMock.mockResolvedValueOnce([{
      fecha_hasta: '2026-07-04',
      resumen: [{  // este cierre NO incluye cuenta_id=1
        cuenta_id: 999, cuenta_nombre: 'Otra Cuenta', moneda: 'ARS',
        saldo_anterior: 1000, total_cobros: 0, total_gastos: 500, saldo_final: 500,
      }],
    }]);
    sqlMock.mockResolvedValueOnce([{ total: 1 }]);
    sqlMock.mockResolvedValueOnce([
      { id: 1, nombre: 'Caja Secundaria', moneda: 'ARS' },
    ]);
    // cuenta NO encontrada → saldoAnterior=null → consulta saldo_inicial
    sqlMock.mockResolvedValueOnce([{ saldo: '200' }]);
    sqlMock.mockResolvedValueOnce([{ total_cobros: '0', total_gastos: '0' }]);
    sqlMock.mockResolvedValueOnce([{
      id: 2, fecha_desde: '2026-07-05', fecha_hasta: '2026-07-06',
      resumen: [], usuario_id: 1, usuario_nombre: 'Admin Test',
      creado_por: 'Admin Test', created_at: '2026-07-06T00:00:00.000Z',
    }]);

    const req = { json: async () => ({}) } as Request;
    const res = await POST(req);
    expect(res.status).toBe(201);

    const resumenCalculado = await extraerResumenInsert();
    const cuentaSegunda = resumenCalculado.find((r: any) => r.cuenta_id === 1);
    // Con fix: saldoAnterior=null → saldo_inicial=200. Sin fix: scan arrastraba 500.
    expect(cuentaSegunda.saldo_anterior).toBe(200);
  });
});
