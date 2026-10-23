/**
 * @jest-environment node
 *
 * FASE B — Mejoras UI: imágenes de producto en el informe de inversión.
 * Tests del GET route: la imagen se resuelve contra productos.imagen_url ACTUAL
 * (decisión del Director), tanto en vista en vivo como en fecha pasada (snapshot).
 *
 * Fuerza:
 *  - el SELECT en vivo trae imagen_url.
 *  - en fecha pasada, el detalle del snapshot se resuelve con LEFT JOIN a
 *    productos por codigo+empresa_id (no rompe si el snapshot no guarda la imagen).
 *  - producto borrado de productos → imagen_url null (placeholder en la UI).
 */

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sql(...args),
}));

const ADMIN = { user: { id: 1, rol: 'admin', empresas: [1] } };

describe('GET /api/admin/inversion-mercaderia — imagen_url', () => {
  let GET: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/admin/inversion-mercaderia/route');
    GET = mod.GET;
  });

  beforeEach(() => {
    getServerSession.mockReset();
    getServerSession.mockResolvedValue(ADMIN);
    sql.mockReset();
  });

  test('1 — vista en vivo: el SELECT de productos incluye imagen_url', async () => {
    sql.mockResolvedValue([{ codigo: 'A', detalle: 'X', saldo: 40, costo: 12.5, prcventa: 18, imagen_url: 'https://img/a.jpg' }]);
    const res = await GET(new Request('http://localhost/api/admin/inversion-mercaderia'));
    expect(res.status).toBe(200);
    const t = (sql.mock.calls[0][0] as string[]).join('').toLowerCase();
    expect(t).toContain('imagen_url');
  });

  test('2 — fecha pasada: el detalle del snapshot resuelve la imagen con LEFT JOIN a productos (por codigo+empresa_id)', async () => {
    sql
      .mockResolvedValueOnce([{ id: 7, empresa_id: 1, costo_total: '500', venta_potencial_total: '720', ganancia_proyectada: '220', productos_sin_costo: 0 }])
      .mockResolvedValueOnce([{ codigo: 'A', detalle: 'X', saldo: 40, costo: 12.5, prcventa: 18, costo_total: 500, venta_potencial: 720, imagen_url: 'https://img/a.jpg' }]);
    const res = await GET(new Request('http://localhost/api/admin/inversion-mercaderia?fecha=2026-08-19'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.detalle[0].imagen_url).toBe('https://img/a.jpg');
    // La query de detalle une productos para traer la imagen actual.
    const q = (sql.mock.calls[1][0] as string[]).join('').toLowerCase();
    expect(q).toContain('left join productos');
    expect(q).toContain('imagen_url');
  });

  test('3 — fecha pasada: producto borrado de productos → imagen_url null (placeholder, no rompe)', async () => {
    sql
      .mockResolvedValueOnce([{ id: 7, empresa_id: 1, costo_total: '500', venta_potencial_total: '720', ganancia_proyectada: '220', productos_sin_costo: 0 }])
      .mockResolvedValueOnce([{ codigo: 'A', detalle: 'X', saldo: 40, costo: 12.5, prcventa: 18, costo_total: 500, venta_potencial: 720, imagen_url: null }]);
    const res = await GET(new Request('http://localhost/api/admin/inversion-mercaderia?fecha=2026-08-19'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.detalle[0].imagen_url).toBeNull();
  });

  test('4 — el SELECT del snapshot incluye empresa_id (necesario para el join por codigo+empresa_id)', async () => {
    sql
      .mockResolvedValueOnce([{ id: 7, empresa_id: 1, costo_total: '500', venta_potencial_total: '720', ganancia_proyectada: '220', productos_sin_costo: 0 }])
      .mockResolvedValueOnce([]);
    await GET(new Request('http://localhost/api/admin/inversion-mercaderia?fecha=2026-08-19'));
    const snapQ = (sql.mock.calls[0][0] as string[]).join('').toLowerCase();
    expect(snapQ).toContain('empresa_id');
  });
});
export {};
