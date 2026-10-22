/**
 * @jest-environment node
 *
 * Fase B — POST /api/productos/[id]/eliminar (soft-delete).
 *
 * Intenta romper el slice: permisos (401/403), existencia (404),
 * validaciones (400 ya eliminado / 409 con stock) y que el UPDATE sea
 * un soft-delete de una sola tabla, sin propagacion ni DELETE fisico.
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

const RUTA = '@/app/api/productos/[id]/eliminar/route';

describe('POST /api/productos/[id]/eliminar', () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import(RUTA);
    POST = mod.POST;
  });

  beforeEach(() => {
    getServerSession.mockReset();
    sql.mockReset();
    sqlQuery.mockReset();
    sqlTransaction.mockReset();
  });

  const makeReq = () =>
    new NextRequest('http://localhost/api/productos/1/eliminar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

  const ctx = { params: Promise.resolve({ id: '1' }) };

  const authAdmin = () => {
    getServerSession.mockResolvedValue({ user: { rol: 'admin', empresas: [2] } });
  };

  const sqlEmitido = (): string[] =>
    [
      ...sql.mock.calls.map((c: any) => String(Array.isArray(c[0]) ? c[0].join('') : c[0])),
      ...sqlQuery.mock.calls.map((c: any) => String(c[0])),
    ].map((s) => s.toLowerCase());

  // ── Permisos ──────────────────────────────────────────────────────
  describe('permisos', () => {
    test('sin sesion → 401 "No autorizado"', async () => {
      getServerSession.mockResolvedValue(null);
      const res = await POST(makeReq(), ctx);
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('No autorizado');
    });

    test('vendedor (no admin) → 403, sin tocar la base', async () => {
      getServerSession.mockResolvedValue({ user: { rol: 'vendedor', empresas: [2] } });
      const res = await POST(makeReq(), ctx);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('Solo administradores pueden eliminar un producto');
      expect(sql).not.toHaveBeenCalled();
    });

    test('supervisor (no admin) → 403', async () => {
      getServerSession.mockResolvedValue({ user: { rol: 'supervisor', empresas: [2] } });
      const res = await POST(makeReq(), ctx);
      expect(res.status).toBe(403);
      expect(sql).not.toHaveBeenCalled();
    });

    test('admin sin acceso a la empresa del producto → 403 "No tienes acceso a este producto"', async () => {
      getServerSession.mockResolvedValue({ user: { rol: 'admin', empresas: [99] } });
      sql.mockResolvedValueOnce([{ empresa_id: 2, saldo: 0, activo: true }]);
      const res = await POST(makeReq(), ctx);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('No tienes acceso a este producto');
    });
  });

  // ── Existencia ────────────────────────────────────────────────────
  test('producto inexistente → 404 "Producto no encontrado"', async () => {
    authAdmin();
    sql.mockResolvedValueOnce([]);
    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Producto no encontrado');
  });

  // ── Validaciones ──────────────────────────────────────────────────
  describe('validaciones', () => {
    test('ya eliminado (activo=false) → 400 "Este producto ya fue eliminado"', async () => {
      authAdmin();
      sql.mockResolvedValueOnce([{ empresa_id: 2, saldo: 0, activo: false }]);
      const res = await POST(makeReq(), ctx);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Este producto ya fue eliminado');
    });

    test('ya eliminado gana sobre saldo>0: 400, no 409', async () => {
      authAdmin();
      sql.mockResolvedValueOnce([{ empresa_id: 2, saldo: 15, activo: false }]);
      const res = await POST(makeReq(), ctx);
      expect(res.status).toBe(400);
    });

    test('saldo > 0 → 409 con el saldo en el mensaje', async () => {
      authAdmin();
      sql.mockResolvedValueOnce([{ empresa_id: 2, saldo: 7, activo: true }]);
      const res = await POST(makeReq(), ctx);
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('No se puede eliminar: el producto tiene stock (saldo: 7 unidades)');
    });

    test('saldo > 0 con decimal conserva el valor real en el mensaje', async () => {
      authAdmin();
      sql.mockResolvedValueOnce([{ empresa_id: 2, saldo: 3.5, activo: true }]);
      const res = await POST(makeReq(), ctx);
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('No se puede eliminar: el producto tiene stock (saldo: 3.5 unidades)');
    });

    test('saldo negativo (descuadre) NO bloquea la eliminacion', async () => {
      authAdmin();
      sql.mockResolvedValueOnce([{ empresa_id: 2, saldo: -2, activo: true }]);
      sql.mockResolvedValueOnce([{ id: 1, activo: false }]);
      const res = await POST(makeReq(), ctx);
      expect(res.status).toBe(200);
    });

    test('saldo 0 → permitido', async () => {
      authAdmin();
      sql.mockResolvedValueOnce([{ empresa_id: 2, saldo: 0, activo: true }]);
      sql.mockResolvedValueOnce([{ id: 1, activo: false }]);
      const res = await POST(makeReq(), ctx);
      expect(res.status).toBe(200);
    });
  });

  // ── Exito ─────────────────────────────────────────────────────────
  describe('exito', () => {
    const happy = () => {
      authAdmin();
      sql
        .mockResolvedValueOnce([{ empresa_id: 2, saldo: 0, activo: true }])
        .mockResolvedValueOnce([{ id: 1, codigo: 'PROD-01', activo: false }]);
    };

    test('200 con data del producto y message "Producto eliminado"', async () => {
      happy();
      const res = await POST(makeReq(), ctx);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual({ id: 1, codigo: 'PROD-01', activo: false });
      expect(body.message).toBe('Producto eliminado');
    });

    test('es soft-delete: UPDATE activo = false + updated_at, NUNCA DELETE fisico', async () => {
      happy();
      await POST(makeReq(), ctx);
      const q = sqlEmitido().join(' || ');
      expect(q).toContain('update');
      expect(q).toContain('activo = false');
      expect(q).toContain('updated_at = now()');
      expect(q).not.toMatch(/\bdelete\s+from\b/);
    });

    test('no hay propagacion: una sola sentencia, sin transaccion multi-tabla', async () => {
      happy();
      await POST(makeReq(), ctx);
      expect(sqlTransaction).not.toHaveBeenCalled();
      expect(sqlQuery).not.toHaveBeenCalled();
      expect(sql).toHaveBeenCalledTimes(2); // SELECT + UPDATE
    });

    test('no toca ninguna otra tabla', async () => {
      happy();
      await POST(makeReq(), ctx);
      const q = sqlEmitido().join(' || ');
      for (const t of ['ubicaciones_bodega', 'catalogo_precio_override', 'prenota_items',
                       'ingresos_mercaderia', 'conciliaciones_stock', 'catalogo_items',
                       'alertas_stock_bajo', 'pedido_items']) {
        expect(q).not.toContain(t);
      }
    });

    test('el filtro del UPDATE es por id, no por codigo', async () => {
      happy();
      await POST(makeReq(), ctx);
      const upd = sqlEmitido().find((s) => s.includes('update'));
      expect(upd).toBeDefined();
      expect(upd).toContain('where id');
    });
  });

  // ── Errores de base ───────────────────────────────────────────────
  test('fallo de Postgres → 500, no 200 silencioso', async () => {
    authAdmin();
    sql
      .mockResolvedValueOnce([{ empresa_id: 2, saldo: 0, activo: true }])
      .mockRejectedValueOnce(new Error('deadlock detected'));
    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(500);
  });
});
