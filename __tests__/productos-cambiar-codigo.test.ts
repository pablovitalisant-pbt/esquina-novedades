/**
 * @jest-environment node
 *
 * Fase B — POST /api/productos/[id]/cambiar-codigo
 *
 * Intenta romper el slice: permisos (401/403), existencia (404), validaciones
 * (400), unicidad (409) y atomicidad de la propagacion del codigo a las
 * tablas que lo usan como clave viva.
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

const RUTA = '@/app/api/productos/[id]/cambiar-codigo/route';

describe('POST /api/productos/[id]/cambiar-codigo', () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import(RUTA);
    POST = mod.POST;
  });

  beforeEach(() => {
    // mockReset (no mockClear): mockClear no vacia la cola de mockResolvedValueOnce,
    // y un valor que quede sin consumir contamina el siguiente test.
    getServerSession.mockReset();
    sql.mockReset();
    sqlQuery.mockReset();
    sqlTransaction.mockReset();
    sqlQuery.mockReturnValue({ queryData: {} });
  });

  const makeReq = (body: unknown) =>
    new NextRequest('http://localhost/api/productos/1/cambiar-codigo', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });

  const ctx = { params: Promise.resolve({ id: '1' }) };

  const authAdmin = () => {
    getServerSession.mockResolvedValue({ user: { rol: 'admin', empresas: [2] } });
  };

  /** Concatena todo el SQL emitido (tagged template + sql.query) para inspeccion. */
  const sqlEmitido = (): string[] =>
    [
      ...sql.mock.calls.map((c: any) => String(Array.isArray(c[0]) ? c[0].join('') : c[0])),
      ...sqlQuery.mock.calls.map((c: any) => String(c[0])),
    ].map((s) => s.toLowerCase());

  // ── Permisos ──────────────────────────────────────────────────────
  describe('permisos', () => {
    test('sin sesion → 401 "No autorizado"', async () => {
      getServerSession.mockResolvedValue(null);
      const res = await POST(makeReq({ codigo_nuevo: 'X-2' }), ctx);
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('No autorizado');
    });

    test('vendedor (no admin) → 403, sin tocar la base', async () => {
      getServerSession.mockResolvedValue({ user: { rol: 'vendedor', empresas: [2] } });
      const res = await POST(makeReq({ codigo_nuevo: 'X-2' }), ctx);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('Solo administradores pueden editar el código de un producto');
      expect(sql).not.toHaveBeenCalled();
      expect(sqlTransaction).not.toHaveBeenCalled();
    });

    test('supervisor (no admin) → 403 aunque tenga acceso a la empresa', async () => {
      getServerSession.mockResolvedValue({ user: { rol: 'supervisor', empresas: [2] } });
      const res = await POST(makeReq({ codigo_nuevo: 'X-2' }), ctx);
      expect(res.status).toBe(403);
      expect(sqlTransaction).not.toHaveBeenCalled();
    });

    test('admin sin acceso a la empresa del producto → 403 "No tienes acceso a este producto"', async () => {
      getServerSession.mockResolvedValue({ user: { rol: 'admin', empresas: [99] } });
      sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]);
      const res = await POST(makeReq({ codigo_nuevo: 'X-2' }), ctx);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('No tienes acceso a este producto');
      expect(sqlTransaction).not.toHaveBeenCalled();
    });
  });

  // ── Existencia ────────────────────────────────────────────────────
  test('producto inexistente → 404 "Producto no encontrado"', async () => {
    authAdmin();
    sql.mockResolvedValueOnce([]); // access check sin filas
    const res = await POST(makeReq({ codigo_nuevo: 'X-2' }), ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Producto no encontrado');
    expect(sqlTransaction).not.toHaveBeenCalled();
  });

  // ── Validaciones de codigo_nuevo ──────────────────────────────────
  describe('validacion de codigo_nuevo', () => {
    const conProducto = () => {
      authAdmin();
      sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]);
    };

    test('vacio ("") → 400', async () => {
      conProducto();
      const res = await POST(makeReq({ codigo_nuevo: '' }), ctx);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('El código no puede estar vacío');
      expect(sqlTransaction).not.toHaveBeenCalled();
    });

    test('solo espacios ("   ") → 400 (trim antes de validar)', async () => {
      conProducto();
      const res = await POST(makeReq({ codigo_nuevo: '   ' }), ctx);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('El código no puede estar vacío');
      expect(sqlTransaction).not.toHaveBeenCalled();
    });

    test('ausente / null / no-string → 400, no crashea con 500', async () => {
      // El rechazo es previo a cualquier lectura: no se encola nada en sql.
      for (const body of [{}, { codigo_nuevo: null }, { codigo_nuevo: 123 }]) {
        authAdmin();
        const res = await POST(makeReq(body), ctx);
        expect(res.status).toBe(400);
        expect(sql).not.toHaveBeenCalled();
        expect(sqlTransaction).not.toHaveBeenCalled();
      }
    });

    test('igual al actual → 400 "El código nuevo es igual al actual"', async () => {
      conProducto();
      const res = await POST(makeReq({ codigo_nuevo: 'PROD-01' }), ctx);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('El código nuevo es igual al actual');
      expect(sqlTransaction).not.toHaveBeenCalled();
    });

    test('igual al actual con espacios alrededor → 400 (comparacion post-trim)', async () => {
      conProducto();
      const res = await POST(makeReq({ codigo_nuevo: '  PROD-01  ' }), ctx);
      expect(res.status).toBe(400);
      expect(sqlTransaction).not.toHaveBeenCalled();
    });
  });

  // ── Unicidad ──────────────────────────────────────────────────────
  describe('unicidad', () => {
    test('codigo ya usado por otro producto de la misma empresa → 409 con el codigo en el mensaje', async () => {
      authAdmin();
      sql
        .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]) // access check
        .mockResolvedValueOnce([{ id: 77 }]); // duplicado encontrado
      const res = await POST(makeReq({ codigo_nuevo: 'PROD-99' }), ctx);
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe("Ya existe un producto con el código 'PROD-99' en esta empresa");
      expect(sqlTransaction).not.toHaveBeenCalled();
    });

    test('la consulta de unicidad filtra por empresa_id y por codigo', async () => {
      authAdmin();
      sql
        .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }])
        .mockResolvedValueOnce([]);
      sqlTransaction.mockResolvedValueOnce([[{ id: 1, codigo: 'PROD-99' }], [], [], []]);

      await POST(makeReq({ codigo_nuevo: 'PROD-99' }), ctx);

      const q = String(sql.mock.calls[1][0]).toLowerCase();
      expect(q).toContain('from productos');
      expect(q).toContain('empresa_id');
      expect(q).toContain('limit');
      // el codigo buscado viaja como parametro, no interpolado en el SQL
      expect(String(sql.mock.calls[1][0])).not.toContain('PROD-99');
      expect(sql.mock.calls[1]).toContain('PROD-99');
    });

    test('el trim se aplica antes de buscar duplicados (espacios no lo salvan de un 409)', async () => {
      authAdmin();
      sql
        .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }])
        .mockResolvedValueOnce([{ id: 77 }]);
      const res = await POST(makeReq({ codigo_nuevo: '  PROD-99  ' }), ctx);
      expect(res.status).toBe(409);
      expect(sql.mock.calls[1]).toContain('PROD-99'); // sin espacios
    });
  });

  // ── Happy path ────────────────────────────────────────────────────
  describe('exito', () => {
    const happy = () => {
      authAdmin();
      sql
        .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]) // access check
        .mockResolvedValueOnce([]); // sin duplicado
      sqlTransaction.mockResolvedValueOnce([
        [{ id: 1, codigo: 'PROD-99' }], // UPDATE productos
        [],                              // UPDATE ubicaciones_bodega
        [],                              // UPDATE catalogo_precio_override
        [],                              // UPDATE prenota_items
      ]);
    };

    test('200 con data del producto actualizado y message', async () => {
      happy();
      const res = await POST(makeReq({ codigo_nuevo: 'PROD-99' }), ctx);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual({ id: 1, codigo: 'PROD-99' });
      expect(body.message).toBe('Código actualizado');
    });

    test('todo el UPDATE corre en UNA sola transaccion', async () => {
      happy();
      await POST(makeReq({ codigo_nuevo: 'PROD-99' }), ctx);
      expect(sqlTransaction).toHaveBeenCalledTimes(1);
    });

    test('propaga a las 4 tablas: productos, ubicaciones_bodega, catalogo_precio_override, prenota_items', async () => {
      happy();
      await POST(makeReq({ codigo_nuevo: 'PROD-99' }), ctx);

      const queries = sqlTransaction.mock.calls[0][0] as any[];
      expect(Array.isArray(queries)).toBe(true);
      expect(queries.length).toBe(4);

      const todo = sqlEmitido().join(' || ');
      for (const tabla of ['productos', 'ubicaciones_bodega', 'catalogo_precio_override', 'prenota_items']) {
        expect(todo).toContain(tabla);
      }
    });

    test('UPDATE productos setea codigo y updated_at', async () => {
      happy();
      await POST(makeReq({ codigo_nuevo: 'PROD-99' }), ctx);
      const q = sqlEmitido().join(' || ');
      expect(q).toContain('update');
      expect(q).toContain('set codigo');
      expect(q).toContain('updated_at = now()');
    });

    test('ubicaciones_bodega se actualiza acotado por empresa_id del producto', async () => {
      happy();
      await POST(makeReq({ codigo_nuevo: 'PROD-99' }), ctx);
      const q = sqlEmitido().find((s) => s.includes('ubicaciones_bodega'));
      expect(q).toBeDefined();
      expect(q).toContain('empresa_id');
      expect(q).toContain('codigo');
    });

    test('prenota_items solo toca prenotas activas sin movimientos de caja', async () => {
      happy();
      await POST(makeReq({ codigo_nuevo: 'PROD-99' }), ctx);
      const q = sqlEmitido().find((s) => s.includes('prenota_items'));
      expect(q).toBeDefined();
      expect(q).toContain("estado = 'activa'");
      expect(q).toContain('not exists');
      expect(q).toContain('caja_movimiento_notas');
    });

    test('NO toca tablas de bitacora historica', async () => {
      happy();
      await POST(makeReq({ codigo_nuevo: 'PROD-99' }), ctx);
      const q = sqlEmitido().join(' || ');
      expect(q).not.toContain('ingresos_mercaderia');
      expect(q).not.toContain('conciliaciones_stock');
      expect(q).not.toContain('catalogo_items');
      expect(q).not.toContain('alertas_stock_bajo');
    });

    test('el codigo nuevo viaja como parametro, nunca interpolado en el SQL', async () => {
      happy();
      await POST(makeReq({ codigo_nuevo: "PROD-99'; DROP TABLE productos; --" }), ctx);
      const q = sqlEmitido().join(' || ');
      expect(q).not.toContain('drop table');
    });
  });

  // ── Errores de base ───────────────────────────────────────────────
  test('fallo de Postgres en la transaccion → 500, no 200 silencioso', async () => {
    authAdmin();
    sql
      .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }])
      .mockResolvedValueOnce([]);
    sqlTransaction.mockRejectedValueOnce(new Error('deadlock detected'));
    const res = await POST(makeReq({ codigo_nuevo: 'PROD-99' }), ctx);
    expect(res.status).toBe(500);
  });
});
