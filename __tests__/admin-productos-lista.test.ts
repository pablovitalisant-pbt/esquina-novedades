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

const PRODUCTOS_DEPORTE = [
  { id: 1, codigo: 'DEP-01', detalle: 'Pelota', imagen_url: null, categoria: 'Deporte' },
  { id: 2, codigo: 'DEP-02', detalle: 'Raqueta', imagen_url: null, categoria: 'Deporte' },
];
const PRODUCTOS_SIN_CATEGORIA = [
  { id: 3, codigo: 'X-01', detalle: 'Producto sin cat', imagen_url: null, categoria: null },
];

describe('GET /api/admin/productos-lista — filtro categoriaFiltro', () => {
  let GET: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/admin/productos-lista/route');
    GET = mod.GET;
  });

  beforeEach(() => {
    getServerSession.mockClear();
    sql.mockClear();
    getServerSession.mockResolvedValue({ user: { id: 1, rol: 'admin', empresas: [2] } });
  });

  test('1 — categoriaFiltro=Deporte: la query SQL filtra por categoria = Deporte', async () => {
    sql
      .mockResolvedValueOnce(PRODUCTOS_DEPORTE)
      .mockResolvedValueOnce([{ total: 2 }]);

    const req = new Request('http://localhost/api/admin/productos-lista?categoriaFiltro=Deporte&limit=50&offset=0');
    const res = await GET(req);
    expect(res.status).toBe(200);

    // Verificar que la primera query SQL contiene 'categoria' en su template
    const firstQueryTemplate: string[] = sql.mock.calls[0][0];
    const fullTemplate = firstQueryTemplate.join('').toLowerCase();
    expect(fullTemplate).toContain('categoria');
    // Y que NO usa categoria IS NULL (eso sería para __sin__)
    expect(fullTemplate).not.toContain('is null');
  });

  test('2 — categoriaFiltro=__sin__: la query SQL filtra por categoria IS NULL', async () => {
    sql
      .mockResolvedValueOnce(PRODUCTOS_SIN_CATEGORIA)
      .mockResolvedValueOnce([{ total: 1 }]);

    const req = new Request('http://localhost/api/admin/productos-lista?categoriaFiltro=__sin__&limit=50&offset=0');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const firstQueryTemplate: string[] = sql.mock.calls[0][0];
    const fullTemplate = firstQueryTemplate.join('').toLowerCase();
    expect(fullTemplate).toContain('is null');
  });

  test('3 — sinCategoria=true: la query SQL filtra por categoria IS NULL (comportamiento actual)', async () => {
    sql
      .mockResolvedValueOnce(PRODUCTOS_SIN_CATEGORIA)
      .mockResolvedValueOnce([{ total: 1 }]);

    const req = new Request('http://localhost/api/admin/productos-lista?sinCategoria=true&limit=50&offset=0');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const firstQueryTemplate: string[] = sql.mock.calls[0][0];
    const fullTemplate = firstQueryTemplate.join('').toLowerCase();
    expect(fullTemplate).toContain('is null');
  });
});
export {};
