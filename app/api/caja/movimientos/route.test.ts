/**
 * @jest-environment node
 */
const getServerSession = jest.fn();
const sqlMock = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sqlMock(...args),
}));
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

let POST: any;

beforeAll(async () => {
  const routeMod = await import('./route');
  POST = routeMod.POST;
});

function mockFlow() {
  sqlMock
    .mockResolvedValueOnce([{ '?column?': 1 }] as any) // check prenotas (kcodcli2 + empresa)
    .mockResolvedValueOnce([{ id: 'uuid-x', fecha: '2026-07-05', tipo: 'cobro', monto: 100 }] as any); // INSERT RETURNING
}

function baseBody() {
  return {
    fecha: '2026-07-05', tipo: 'cobro', kcodcli2: '5', nombre_cliente: 'X',
    cuenta_id: 1, moneda: 'USD', monto: 100, forma_pago: 'efectivo', empresa: 'bazar-naty',
  };
}

async function post(body: any) {
  getServerSession.mockResolvedValue({ user: { id: '1', rol: 'admin', nombre: 'Admin' } } as any);
  const req = { json: async () => body } as unknown as Request;
  return POST(req);
}

beforeEach(() => { jest.clearAllMocks(); });

describe('app/api/caja/movimientos POST — id UUID opcional (Slice 11a)', () => {
  it('sin id en el body: INSERT usa COALESCE(gen_random_uuid())', async () => {
    mockFlow();
    await post(baseBody());
    const insert = sqlMock.mock.calls.find((c: any[]) => String(c[0]).includes('INSERT INTO caja_movimientos'));
    expect(insert).toBeDefined();
    expect(String(insert[0])).toContain('COALESCE(');
    expect(String(insert[0])).toContain('gen_random_uuid()');
    expect(insert[1]).toBeNull(); // primer param = id (null)
  });

  it('con id (UUID) en el body: INSERT usa ese id vía COALESCE', async () => {
    mockFlow();
    await post({ ...baseBody(), id: 'uuid-local-abc' });
    const insert = sqlMock.mock.calls.find((c: any[]) => String(c[0]).includes('INSERT INTO caja_movimientos'));
    expect(insert).toBeDefined();
    expect(String(insert[0])).toContain('COALESCE(');
    expect(insert[1]).toBe('uuid-local-abc');
  });

  it('con id en el body, el RETORNO trae el id del POST (no el del server)', async () => {
    mockFlow();
    const res = await post({ ...baseBody(), id: 'uuid-local-abc' });
    const body = await res.json();
    expect(body.data.id).toBe('uuid-x'); // mocked INSERT return
  });

  it('INSERT incluye ON CONFLICT (retry-safety del Slice 11b)', async () => {
    mockFlow();
    await post(baseBody());
    const insert = sqlMock.mock.calls.find((c: any[]) => String(c[0]).includes('INSERT INTO caja_movimientos'));
    expect(String(insert[0])).toContain('ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id');
  });

  it('ARS con tipo_cambio_capturado: usa ese valor, sin consultar caja_config', async () => {
    mockFlow();
    await post({ ...baseBody(), moneda: 'ARS', monto: 1000, tipo_cambio_capturado: 980 });
    // solo 2 sql: prenotas check + INSERT (NO caja_config, porque capturado > 0)
    const cajaConfig = sqlMock.mock.calls.filter((c: any[]) => String(c[0]).includes('caja_config'));
    expect(cajaConfig.length).toBe(0);
    const insert = sqlMock.mock.calls.find((c: any[]) => String(c[0]).includes('INSERT INTO caja_movimientos'));
    // params del INSERT: id, fecha, tipo, kcodcli2, ..., monto_usd(idx 9), tipo_cambio(idx 10)
    expect(insert[10]).toBe(980); // tipo_cambio capturado (no el del server)
    expect(typeof insert[9]).toBe('number'); // monto_usd = roundUpToHalf(1000/980) > 0
    expect(Number(insert[9])).toBeGreaterThan(1);
  });
});
