/**
 * @jest-environment node
 */
/**
 * Fase B — PUT /api/productos/[id]: validaciones por campo y rangos.
 * Todos los campos del whitelist requieren admin (check unico simplificado).
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

describe('PUT /api/productos/[id] — validacion de campos', () => {
  let PUT: (req: Request, ctx: { params: { id: string } }) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/productos/[id]/route');
    PUT = mod.PUT as unknown as typeof PUT;
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

  const authAdmin = () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] },
    });
  };

  describe('sin campos enviados', () => {
    test('body vacio → "Nada que actualizar" (comportamiento preservado, 200)', async () => {
      authAdmin();
      const res = await PUT(makeReq({}), ctx);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message || body.error).toMatch(/nada|actualizar|vacio/i);
    });
  });

  describe('costo', () => {
    test('costo <= 0 → 400', async () => {
      authAdmin();
      const res = await PUT(makeReq({ costo: 0 }), ctx);
      expect(res.status).toBe(400);
    });

    test('costo negativo → 400', async () => {
      authAdmin();
      const res = await PUT(makeReq({ costo: -5 }), ctx);
      expect(res.status).toBe(400);
    });

    test('costo string malformado → 400 (NaN bypass)', async () => {
      authAdmin();
      const res = await PUT(makeReq({ costo: 'abc' }), ctx);
      expect(res.status).toBe(400);
    });

    test('costo null → 400 (null bypass)', async () => {
      authAdmin();
      const res = await PUT(makeReq({ costo: null }), ctx);
      expect(res.status).toBe(400);
    });
  });

  describe('margen_pct', () => {
    // Slice 2a: margen_pct es calculado por el servidor; lo que llegue del body se ignora.
    test('margen_pct del body se ignora (sin otros campos → "Nada que actualizar")', async () => {
      authAdmin();
      const res = await PUT(makeReq({ margen_pct: 30 }), ctx);
      expect(res.status).toBe(200);
      expect(sql).not.toHaveBeenCalled();
    });

    test('margen_pct negativo también se ignora (no es un campo editable)', async () => {
      authAdmin();
      const res = await PUT(makeReq({ margen_pct: -1 }), ctx);
      expect(res.status).toBe(200);
      expect(sql).not.toHaveBeenCalled();
    });
  });

  describe('umed', () => {
    // BUG-umed-corrupto: umed es una etiqueta corta (ej. "U"), no una cantidad.
    // Sin validar, quedaron guardados valores como "18U" y "240" que rompian
    // la vista de Packing en /precios (Gl81299-1, MY-2016 y otros 13 productos).
    test('umed con digitos ("18U") → 400', async () => {
      authAdmin();
      const res = await PUT(makeReq({ umed: '18U' }), ctx);
      expect(res.status).toBe(400);
    });

    test('umed solo digitos ("240") → 400', async () => {
      authAdmin();
      const res = await PUT(makeReq({ umed: '240' }), ctx);
      expect(res.status).toBe(400);
    });

    test('umed demasiado largo (>4 caracteres) → 400', async () => {
      authAdmin();
      const res = await PUT(makeReq({ umed: 'CAJAS' }), ctx);
      expect(res.status).toBe(400);
    });

    test('umed vacio → 400', async () => {
      authAdmin();
      const res = await PUT(makeReq({ umed: '' }), ctx);
      expect(res.status).toBe(400);
    });

    test('umed no-string (numero) → 400 (bypass de tipo)', async () => {
      authAdmin();
      const res = await PUT(makeReq({ umed: 18 }), ctx);
      expect(res.status).toBe(400);
    });

    test('umed valido ("U") → pasa validacion', async () => {
      authAdmin();
      sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]);
      sqlTransaction.mockResolvedValueOnce([[{ id: 1, umed: 'U' }]]);
      const res = await PUT(makeReq({ umed: 'U' }), ctx);
      expect(res.status).toBe(200);
    });

    test('umed valido ("SET") → pasa validacion', async () => {
      authAdmin();
      sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]);
      sqlTransaction.mockResolvedValueOnce([[{ id: 1, umed: 'SET' }]]);
      const res = await PUT(makeReq({ umed: 'SET' }), ctx);
      expect(res.status).toBe(200);
    });

    test('umed fuera de la whitelist ("PAR", solo letras pero no permitido) → 400', async () => {
      authAdmin();
      const res = await PUT(makeReq({ umed: 'PAR' }), ctx);
      expect(res.status).toBe(400);
    });
  });

  describe('prcventa', () => {
    test('prcventa <= 0 → 400', async () => {
      authAdmin();
      const res = await PUT(makeReq({ prcventa: 0 }), ctx);
      expect(res.status).toBe(400);
    });

    test('prcventa no entero → 400', async () => {
      authAdmin();
      const res = await PUT(makeReq({ prcventa: 12.5 }), ctx);
      expect(res.status).toBe(400);
    });

    test('prcventa como string → 400 (precio directo debe ser número)', async () => {
      authAdmin();
      const res = await PUT(makeReq({ prcventa: '100' }), ctx);
      expect(res.status).toBe(400);
    });
  });

  describe('prcminimo', () => {
    test('prcminimo negativo → 400', async () => {
      authAdmin();
      const res = await PUT(makeReq({ prcminimo: -1 }), ctx);
      expect(res.status).toBe(400);
    });

    test('prcminimo = 0 valido', async () => {
      authAdmin();
      sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]);
      sqlTransaction.mockResolvedValueOnce([[{ id: 1, prcminimo: 0 }]]);
      const res = await PUT(makeReq({ prcminimo: 0 }), ctx);
      expect(res.status).toBe(200);
    });

    test('prcminimo = null valido', async () => {
      authAdmin();
      sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]);
      sqlTransaction.mockResolvedValueOnce([[{ id: 1, prcminimo: null }]]);
      const res = await PUT(makeReq({ prcminimo: null }), ctx);
      expect(res.status).toBe(200);
    });
  });

  describe('cantcaja', () => {
    test('cantcaja < 1 → 400', async () => {
      authAdmin();
      const res = await PUT(makeReq({ cantcaja: 0 }), ctx);
      expect(res.status).toBe(400);
    });

    test('cantcaja = 1 valido', async () => {
      authAdmin();
      sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]);
      sqlTransaction.mockResolvedValueOnce([[{ id: 1, cantcaja: 1 }]]);
      const res = await PUT(makeReq({ cantcaja: 1 }), ctx);
      expect(res.status).toBe(200);
    });
  });

  describe('pesocaja / cubicaja', () => {
    test('pesocaja negativo → 400', async () => {
      authAdmin();
      const res = await PUT(makeReq({ pesocaja: -1 }), ctx);
      expect(res.status).toBe(400);
    });

    test('pesocaja null → 400 (null bypass)', async () => {
      authAdmin();
      const res = await PUT(makeReq({ pesocaja: null }), ctx);
      expect(res.status).toBe(400);
    });

    test('cubicaja negativo → 400', async () => {
      authAdmin();
      const res = await PUT(makeReq({ cubicaja: -1 }), ctx);
      expect(res.status).toBe(400);
    });

    test('pesocaja = 0 valido', async () => {
      authAdmin();
      sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]);
      sqlTransaction.mockResolvedValueOnce([[{ id: 1, pesocaja: 0 }]]);
      const res = await PUT(makeReq({ pesocaja: 0 }), ctx);
      expect(res.status).toBe(200);
    });
  });

  describe('categoria', () => {
    test('categoria invalida → 400', async () => {
      authAdmin();
      sql
        .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]) // access check ok
        .mockResolvedValueOnce([]); // categoria no existe
      const res = await PUT(makeReq({ categoria: 'NoExiste' }), ctx);
      expect(res.status).toBe(400);
    });
  });
});
