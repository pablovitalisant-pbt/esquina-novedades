/**
 * @jest-environment node
 */
const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sql(...args),
}));

describe('GET /api/productos (Slice 2)', () => {
  beforeEach(() => {
    getServerSession.mockClear();
    sql.mockClear();
  });

  test('API devuelve productos de todas las empresas del usuario', async () => {
    const { GET } = await import('@/app/api/productos/route');

    getServerSession.mockResolvedValue({
      user: { empresas: [1, 2] },
    });

    sql.mockResolvedValue([
      { id: 1, codigo: 'A', empresa_id: 1 },
      { id: 2, codigo: 'B', empresa_id: 2 },
    ]);

    const req = { url: 'http://localhost/api/productos?search=abc' } as Request;
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    const empresaIds = body.data.map((p: any) => p.empresa_id);
    expect(empresaIds).toContain(1);
    expect(empresaIds).toContain(2);
  });

  test('API incluye nombre_empresa en cada producto', async () => {
    const { GET } = await import('@/app/api/productos/route');

    getServerSession.mockResolvedValue({
      user: { empresas: [1] },
    });

    sql.mockResolvedValue([
      {
        id: 1,
        codigo: 'ABC',
        nombre_empresa: 'Bazar Naty',
        empresa_id: 1,
      },
    ]);

    const req = { url: 'http://localhost/api/productos?search=abc' } as Request;
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data[0].nombre_empresa).toBe('Bazar Naty');
  });

  test('API rechaza request sin sesión', async () => {
    const { GET } = await import('@/app/api/productos/route');

    getServerSession.mockResolvedValue(null);

    const req = { url: 'http://localhost/api/productos?search=abc' } as Request;
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
