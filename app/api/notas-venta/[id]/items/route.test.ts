/**
 * @jest-environment node
 */
const getServerSession = jest.fn();
const sqlMock = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));
jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sqlMock(...args),
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

let POST: typeof import('./route').POST;

beforeAll(async () => {
  const routeMod = await import('./route');
  POST = routeMod.POST;
});

function mockFlujo(nuevoId: string | null) {
  // Orden de las queries del POST:
  // 0) nota activa  1) liberación perezosa (8c)  2) UPDATE stock
  // 3) UPDATE ubicaciones  4) INSERT  5) UPDATE prenotas updated_at
  sqlMock
    .mockResolvedValueOnce([{ estado: 'activa' }] as any)
    .mockResolvedValueOnce([{ liberados: 0, unidades: 0 }] as any)
    .mockResolvedValueOnce([{ saldo: 5 }] as any)
    .mockResolvedValueOnce([] as any)
    .mockResolvedValueOnce([{ id: nuevoId ?? 'gen-uuid', codigo: 'A-001', prenota_id: 40 }] as any)
    .mockResolvedValueOnce([] as any);
}

const baseBody = {
  codigo: 'A-001', descripcion: 'Producto A', imagen_url: null, empresa_id: 1,
  cajas: 1, unidades: 2, precio: 10, stock_referencia: 5,
};

async function post(body: any) {
  const session = { user: { id: '7', rol: 'vendedor' } };
  getServerSession.mockResolvedValue(session as any);
  const req = new Request('http://localhost/api/notas-venta/40/items', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as any;
  return POST(req, { params: Promise.resolve({ id: '40' }) });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('app/api/notas-venta/[id]/items POST — id UUID opcional (Slice 10a)', () => {
  it('sin id en el body: INSERT usa COALESCE(gen_random_uuid())', async () => {
    mockFlujo(null);
    const res = await post(baseBody);
    expect(res.status).toBe(200); // la ruta no setea status 201 (comportamiento existente)
    const insertCall = sqlMock.mock.calls[4][0];
    const q = String(insertCall);
    expect(q).toContain('INSERT INTO public.prenota_items (id, prenota_id');
    expect(q).toContain('COALESCE(');
    expect(q).toContain('gen_random_uuid()');
    // param 0 = id (null), param 1 = prenota_id (40)
    expect(sqlMock.mock.calls[4][1]).toBeNull();
    expect(sqlMock.mock.calls[4][2]).toBe(40);
  });

  it('con id (UUID) en el body: INSERT usa ese id vía COALESCE', async () => {
    mockFlujo('uuid-local-abc');
    const res = await post({ ...baseBody, id: 'uuid-local-abc' });
    expect(res.status).toBe(200);
    const insertCall = sqlMock.mock.calls[4];
    // param 0 = id (uuid-local-abc), param 1 = prenota_id (40)
    expect(insertCall[1]).toBe('uuid-local-abc');
    expect(insertCall[2]).toBe(40);
    expect(insertCall[0].join(' ')).toContain('COALESCE');
  });

  it('flujo completo sin regresión: POST retorna el item creado', async () => {
    mockFlujo('uuid-local-abc');
    const res = await post(baseBody);
    const body = await res.json();
    expect(body.codigo).toBe('A-001');
  });
});
export {};
