/**
 * @jest-environment node
 */
/**
 * Fase B — PUT /api/productos/[id]: permisos simplificados.
 * Todo el whitelist requiere admin (un solo check, no por grupo de campos).
 * Verifica que usuario no-admin recibe 403 para cualquier campo.
 */
import { NextRequest } from 'next/server';

const getServerSession = jest.fn();
const sql = jest.fn();
const sqlQuery = jest.fn();
const sqlTransaction = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => {
  const fn = (...args: any[]) => sql(...args);
  fn.query = (...args: any[]) => sqlQuery(...args);
  fn.transaction = (...args: any[]) => sqlTransaction(...args);
  return { sql: fn };
});

describe('PUT /api/productos/[id] — permisos admin', () => {
  let PUT: (req: Request, ctx: { params: { id: string } }) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/productos/[id]/route');
    PUT = mod.PUT;
  });

  beforeEach(() => {
    getServerSession.mockClear();
    sql.mockClear();
    sqlQuery.mockClear();
    sqlQuery.mockReturnValue({ queryData: {} });
    sqlTransaction.mockClear();
  });

  const makeReq = (body: unknown) =>
    new NextRequest('http://localhost/api/productos/1', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });

  const ctx = { params: { id: '1' } };

  describe('usuario no-admin (vendedor)', () => {
    const setVendedor = () => {
      getServerSession.mockResolvedValue({
        user: { rol: 'vendedor', empresas: [2] },
      });
    };

    test('intenta editar detalle → 403', async () => {
      setVendedor();
      const res = await PUT(makeReq({ detalle: 'Nuevo' }), ctx);
      expect(res.status).toBe(403);
    });

    test('intenta editar costo → 403', async () => {
      setVendedor();
      const res = await PUT(makeReq({ costo: 10 }), ctx);
      expect(res.status).toBe(403);
    });

    test('intenta editar margen_pct → 403', async () => {
      setVendedor();
      const res = await PUT(makeReq({ margen_pct: 30 }), ctx);
      expect(res.status).toBe(403);
    });

    test('intenta editar prcventa → 403', async () => {
      setVendedor();
      const res = await PUT(makeReq({ prcventa: 100 }), ctx);
      expect(res.status).toBe(403);
    });

    test('intenta editar prcminimo → 403', async () => {
      setVendedor();
      const res = await PUT(makeReq({ prcminimo: 50 }), ctx);
      expect(res.status).toBe(403);
    });

    test('intenta editar umed → 403', async () => {
      setVendedor();
      const res = await PUT(makeReq({ umed: 'Kg' }), ctx);
      expect(res.status).toBe(403);
    });

    test('intenta editar cantcaja → 403', async () => {
      setVendedor();
      const res = await PUT(makeReq({ cantcaja: 10 }), ctx);
      expect(res.status).toBe(403);
    });

    test('intenta editar categoria → 403', async () => {
      setVendedor();
      const res = await PUT(makeReq({ categoria: 'Medicina' }), ctx);
      expect(res.status).toBe(403);
    });

    test('intenta editar es_nuevo → 403', async () => {
      setVendedor();
      const res = await PUT(makeReq({ es_nuevo: false }), ctx);
      expect(res.status).toBe(403);
    });

    test('intenta editar imagen_url → 403', async () => {
      setVendedor();
      const res = await PUT(makeReq({ imagen_url: null }), ctx);
      expect(res.status).toBe(403);
    });
  });

  describe('usuario admin', () => {
    const setAdmin = () => {
      getServerSession.mockResolvedValue({
        user: { rol: 'admin', empresas: [2] },
      });
    };

    test('admin edita detalle → 200', async () => {
      setAdmin();
      sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]);
      sqlTransaction.mockResolvedValueOnce([[{ id: 1, detalle: 'Nuevo' }]]);
      const res = await PUT(makeReq({ detalle: 'Nuevo' }), ctx);
      expect(res.status).toBe(200);
    });

    test('admin edita costo → 200', async () => {
      setAdmin();
      sql
        .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]) // access check
        .mockResolvedValueOnce([{ costo: 10, margen_pct: 25 }]); // lectura anti-drift
      sqlTransaction.mockResolvedValueOnce([[{ id: 1, costo: 10, margen_pct: 25, prcventa: 12.50 }]]);
      const res = await PUT(makeReq({ costo: 10 }), ctx);
      expect(res.status).toBe(200);
    });

    test('admin edita categoria → 200', async () => {
      setAdmin();
      sql
        .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }])
        .mockResolvedValueOnce([{ nombre: 'Medicina' }]);
      sqlTransaction.mockResolvedValueOnce([[{ id: 1, categoria: 'Medicina' }]]);
      const res = await PUT(makeReq({ categoria: 'Medicina' }), ctx);
      expect(res.status).toBe(200);
    });
  });
});
