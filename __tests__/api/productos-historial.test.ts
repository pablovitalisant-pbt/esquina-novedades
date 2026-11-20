/**
 * @jest-environment node
 *
 * Fase B — S2a: GET /api/productos/[id]/historial (id = código, D1).
 *
 * Riesgos: R1 cajas/unidades, R2 anuladas, R3 varias filas de producto,
 * R4 row explosion por nota, R5 fecha ISO, R6 inexistente, R7 encoding,
 * R8 rol, R9 flag, R10 truncado, R11 reserva convertida, R12 liberada,
 * R13 residual negativo.
 */
import { NextRequest } from 'next/server';
import flags from '@/config/feature-flags.json';
import { GET } from '@/app/api/productos/[id]/historial/route';

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/auth', () => ({ authOptions: {} }));

jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sql(...args),
}));

jest.mock('@/config/feature-flags.json', () =>
  require('@/__tests__/helpers/mockFlags').mockFlags({ 'producto-historial': true }),
);

const PRODUCTO = {
  detalle: 'Set de prueba',
  saldo: 0,
  cantcaja: 12,
  fecha_ingreso: '2026-10-30T14:22:05.000Z',
};

const CAMBIOS = [{ codigo_anterior: 'JS-VIEJO' }];

function mov(over: Record<string, unknown> = {}) {
  return {
    fecha: '2026-11-02T16:10:00.000Z',
    tipo: 'venta',
    cantidad: -8,
    detalle: 'Nota de Venta #12',
    usuario: 'Paola',
    ref_tipo: 'nota',
    ref_id: 12,
    estado: 'activa',
    ...over,
  };
}

const MOVS_JS1640 = [
  mov({ cantidad: -8 }),
  mov({ cantidad: -1, ref_id: 13 }),
  mov({ cantidad: -10, ref_id: 14 }),
  mov({ cantidad: -10, ref_id: 15 }),
  mov({ cantidad: -4, ref_id: 16, estado: 'anulada' }),
  mov({
    tipo: 'reserva', cantidad: -2, detalle: null, usuario: null,
    ref_tipo: 'pedido', ref_id: '3f2a-uuid', estado: 'expirado',
    fecha: '2026-11-08T09:40:00.000Z',
  }),
  mov({
    tipo: 'conciliacion', cantidad: -11, detalle: 'Conteo físico: 0 cajas + 0 unidades (saldo 11 → 0)',
    ref_tipo: 'conciliacion', ref_id: 7, estado: null, fecha: '2026-11-18T18:00:00.000Z',
  }),
];

function pedir(codigo = 'JS-1640') {
  return GET(new NextRequest(`http://localhost/api/productos/${encodeURIComponent(codigo)}/historial`), {
    params: Promise.resolve({ id: codigo }),
  });
}

function queries() {
  return sql.mock.calls.map((call: any[]) => call[0].join(''));
}

describe('GET /api/productos/[id]/historial', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (flags as Record<string, boolean>)['producto-historial'] = true;
    getServerSession.mockResolvedValue({
      user: { id: '1', nombre: 'Paola', rol: 'admin', empresas: [1] },
    });
    sql.mockReset();
    sql
      .mockResolvedValueOnce([PRODUCTO])
      .mockResolvedValueOnce(CAMBIOS)
      .mockResolvedValueOnce(MOVS_JS1640);
  });

  afterEach(() => {
    (flags as Record<string, boolean>)['producto-historial'] = true;
  });

  it('R8: sin sesión → 401 y no consulta', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await pedir();
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('R8: vendedor → 403', async () => {
    getServerSession.mockResolvedValue({ user: { rol: 'vendedor', empresas: [1] } });
    const res = await pedir();
    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  it('R8: bodeguero → 403', async () => {
    getServerSession.mockResolvedValue({ user: { rol: 'bodeguero', empresas: [1] } });
    const res = await pedir();
    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  it('R9: flag apagado → 404 sin tocar la base', async () => {
    (flags as Record<string, boolean>)['producto-historial'] = false;
    const res = await pedir();
    expect(res.status).toBe(404);
    expect(sql).not.toHaveBeenCalled();
  });

  it('R6: producto inexistente → 404', async () => {
    sql.mockReset();
    sql.mockResolvedValueOnce([]);
    const res = await pedir('NO-EXISTE');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no encontrado/i);
  });

  it('R3: agrupa productos por código, respeta activo=true y suma saldo', async () => {
    const res = await pedir();
    expect(res.status).toBe(200);
    const q = queries()[0];
    expect(q).toMatch(/SUM\s*\(\s*p\.saldo\s*\)/i);
    expect(q).toMatch(/GROUP BY\s+p\.codigo/i);
    expect(q).toMatch(/p\.activo\s*=\s*true/i);
    expect((await res.json()).producto.codigo).toBe('JS-1640');
  });

  it('R1: ventas y reservas leen SUM(unidades), nunca unidades*cantcaja', async () => {
    await pedir();
    const q = queries()[2];
    expect(q).toMatch(/SUM\s*\(\s*pi\.unidades\s*\)/i);
    expect(q).not.toMatch(/unidades\s*\*\s*cantcaja/i);
  });

  it('R4: una nota con dos líneas del mismo código produce UNA fila', async () => {
    sql.mockReset();
    sql
      .mockResolvedValueOnce([PRODUCTO])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mov({ cantidad: -9, detalle: 'Nota con 2 líneas (4+5)' })]);
    const res = await pedir();
    const body = await res.json();
    const ventas = body.movimientos.filter((m: any) => m.tipo === 'venta');
    expect(ventas).toHaveLength(1);
    expect(ventas[0].cantidad).toBe(-9);
    expect(queries()[2]).toMatch(/GROUP BY\s+n\.id/i);
  });

  it('R11: la reserva convertida no se cuenta dos veces (no se consulta "convertido")', async () => {
    await pedir();
    const q = queries()[2];
    expect(q).not.toMatch(/'convertido'/i);
    expect(q).toMatch(/estado IN \('expirado', 'descartado', 'rechazado'\)/i);
  });

  it('R2 + R12: anulada y expirada aparecen con efecto 0 y no suman a vendido/reservado', async () => {
    const res = await pedir();
    const body = await res.json();
    const anulada = body.movimientos.find((m: any) => m.estado === 'anulada');
    const expirada = body.movimientos.find((m: any) => m.estado === 'expirado');
    expect(anulada).toMatchObject({ cantidad: -4, efecto: 0 });
    expect(expirada).toMatchObject({ cantidad: -2, efecto: 0 });
    expect(body.resumen.vendido).toBe(29);
    expect(body.resumen.reservado).toBe(0);
  });

  it('caso JS-1640: resumen cuadra y la fila inicial inferida es 40 AL FINAL', async () => {
    const res = await pedir();
    const body = await res.json();
    expect(body.resumen).toMatchObject({
      ingresado: 0,
      ajustes: -11,
      vendido: 29,
      reservado: 0,
      stock_inicial_inferido: 40,
      stock_esperado: 0,
      saldo_actual: 0,
      diferencia: 0,
      truncado: false,
    });
    expect(body.movimientos[body.movimientos.length - 1]).toMatchObject({
      tipo: 'stock_inicial', cantidad: 40, efecto: 40, inferido: true,
    });
    expect(body.movimientos[body.movimientos.length - 1].detalle).toContain('sin registro de ingreso');
  });

  it('ordena del más reciente al más antiguo en SQL', async () => {
    await pedir();
    expect(queries()[2]).toMatch(/ORDER BY\s+fecha\s+DESC,\s*ref_id\s+DESC/i);
    expect(queries()[2]).toMatch(/LIMIT\s/i);
  });

  it('cada movimiento trae "queda" (saldo resultante) para la UI', async () => {
    sql.mockReset();
    sql
      .mockResolvedValueOnce([PRODUCTO])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        mov({ tipo: 'conciliacion', cantidad: -8, ref_tipo: 'conciliacion', ref_id: 7, estado: null }),
        mov({ tipo: 'ingreso', cantidad: 8, ref_tipo: 'ingreso', ref_id: 3, estado: null }),
      ]);
    const res = await pedir();
    const body = await res.json();
    // saldo 0: la conciliación deja 0; el ingreso anterior deja 8.
    expect(body.movimientos.map((m: any) => m.queda)).toEqual([0, 8]);
  });

  it('R13: residual negativo no genera fila inicial y queda como diferencia', async () => {
    sql.mockReset();
    sql
      .mockResolvedValueOnce([{ ...PRODUCTO, saldo: 2 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        mov({ tipo: 'conciliacion', cantidad: 10, detalle: 'Conteo físico', ref_tipo: 'conciliacion', ref_id: 7, estado: null }),
      ]);
    const res = await pedir();
    const body = await res.json();
    expect(body.movimientos.some((m: any) => m.tipo === 'stock_inicial')).toBe(false);
    expect(body.resumen.stock_inicial_inferido).toBe(0);
    expect(body.resumen.diferencia).toBe(-8);
  });

  it('R5: devuelve ISO estricto (sin espacio ni +00)', async () => {
    const res = await pedir();
    const body = await res.json();
    for (const m of body.movimientos) {
      expect(m.fecha).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
    expect(queries()[0]).toMatch(/AT TIME ZONE 'UTC'/i);
    expect(queries()[2]).toMatch(/AT TIME ZONE 'UTC'/i);
  });

  it('R7: código con espacios, ñ y # viaja como parámetro SQL', async () => {
    const raro = 'JS 1640/ñ#1';
    sql.mockReset();
    sql.mockResolvedValueOnce([]);
    const res = await pedir(raro);
    expect(res.status).toBe(404);
    expect(sql.mock.calls[0].slice(1)).toContain(raro);
  });

  it('R10: más de 500 movimientos → truncado, conserva los 500 más recientes', async () => {
    // DESC: la primera fila es la más reciente. La 501 (más antigua) se descarta.
    const muchos = Array.from({ length: 501 }, (_, i) =>
      mov({ ref_id: 1000 - i, fecha: `2026-11-01T00:00:${String(i % 60).padStart(2, '0')}.000Z` }),
    );
    sql.mockReset();
    sql
      .mockResolvedValueOnce([PRODUCTO])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(muchos);
    const res = await pedir();
    const body = await res.json();
    expect(body.movimientos).toHaveLength(500);
    expect(body.resumen.truncado).toBe(true);
    expect(body.resumen.stock_inicial_inferido).toBeNull();
    expect(body.movimientos[0].referencia.id).toBe(1000);
    expect(body.movimientos[499].referencia.id).toBe(501);
    expect(sql.mock.calls[2].slice(1)).toContain(501);
  });

  it('la nota lleva enlace a /notas-venta/:id y el pedido no lleva href', async () => {
    const res = await pedir();
    const body = await res.json();
    const nota = body.movimientos.find((m: any) => m.referencia?.tipo === 'nota');
    const pedido = body.movimientos.find((m: any) => m.referencia?.tipo === 'pedido');
    expect(nota.referencia.href).toBe('/notas-venta/12');
    expect(pedido.referencia.href).toBeNull();
  });
});

describe('B5 — historial tras cambiar el código', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (flags as Record<string, boolean>)['producto-historial'] = true;
    getServerSession.mockResolvedValue({
      user: { id: '1', nombre: 'Paola', rol: 'admin', empresas: [1] },
    });
    sql.mockReset();
    sql
      .mockResolvedValueOnce([PRODUCTO])
      .mockResolvedValueOnce([
        { codigo_anterior: 'JS-VIEJO' },
        { codigo_anterior: 'JS-MAS-VIEJO' },
        { codigo_anterior: 'JS-VIEJO' },
        { codigo_anterior: 'JS-1640' },
      ])
      .mockResolvedValueOnce([
        mov({ cantidad: 40, tipo: 'ingreso', codigo: 'JS-VIEJO', estado: null, ref_tipo: 'ingreso', ref_id: 3 }),
      ]);
  });

  it('consulta la cadena por producto_id dentro de la empresa, en orden temporal', async () => {
    await pedir();
    const q = queries()[1];
    expect(q).toMatch(/productos_codigo_cambios/i);
    expect(q).toMatch(/JOIN\s+(?:public\.)?productos\s+p\s+ON\s+p\.id\s*=\s*c\.producto_id/i);
    expect(q).toMatch(/p\.codigo\s*=/i);
    expect(q).toMatch(/p\.empresa_id\s*=\s*ANY/i);
    expect(q).toMatch(/p\.activo\s*=\s*true/i);
    expect(q).toMatch(/ORDER BY\s+c\.created_at\s+ASC,\s*c\.id\s+ASC/i);
  });

  it('cabecera: deduplica, conserva el orden y excluye el código actual', async () => {
    const res = await pedir();
    const body = await res.json();
    expect(body.producto.codigos_anteriores).toEqual(['JS-VIEJO', 'JS-MAS-VIEJO']);
  });

  it('las ventanas salen de los cambios: cierre del código anterior y apertura del actual', async () => {
    await pedir();
    const q = queries()[2];
    expect(q).toMatch(/productos_codigo_cambios/i);
    expect(q).toMatch(/LAG\s*\(\s*c\.codigo_nuevo\s*\)/i);
    expect(q).toMatch(/LAG\s*\(\s*c\.created_at\s*\)/i);
    expect(q).toMatch(/codigo_anterior\s+AS\s+codigo/i);
    expect(q).toMatch(/v\.codigo\s*=\s*(im|cs|pi)\.codigo/i);
    expect(q).toMatch(/>=\s*v\.desde/i);
    expect(q).toMatch(/<\s*v\.hasta/i);
    expect(q).toMatch(/MAX\s*\(\s*c2\.created_at\s*\)/i);
  });

  it('pedidos se filtran por producto_id, no por ventana de código', async () => {
    await pedir();
    const q = queries()[2];
    expect(q).toMatch(/pi\.producto_id\s+IN\s*\(\s*SELECT\s+id\s+FROM\s+prod\s*\)/i);
  });

  it('rescata la nota activa impaga que la propagación ya pasó al código actual', async () => {
    await pedir();
    const q = queries()[2];
    expect(q).toMatch(/n\.estado\s*=\s*'activa'/i);
    expect(q).toMatch(/NOT EXISTS\s*\(\s*SELECT 1 FROM (?:public\.)?caja_movimiento_notas/i);
    expect(q).toMatch(/pi\.codigo\s*=/i);
  });

  it('una nota con dos códigos distintos no inventa un código', async () => {
    await pedir();
    const q = queries()[2];
    expect(q).toMatch(/CASE WHEN MIN\(pi\.codigo\) = MAX\(pi\.codigo\)/i);
  });

  it('cada movimiento devuelve el código con que se registró', async () => {
    const res = await pedir();
    const body = await res.json();
    expect(body.movimientos[0]).toMatchObject({ tipo: 'ingreso', codigo: 'JS-VIEJO' });
  });

  it('las fuentes con código único lo exponen; notas y pedidos usan el CASE de códigos mezclados', async () => {
    await pedir();
    const q = queries()[2];
    expect(q).toMatch(/im\.codigo\s+AS\s+codigo/i);
    expect(q).toMatch(/cs\.codigo\s+AS\s+codigo/i);
    expect((q.match(/CASE WHEN MIN\(pi\.codigo\) = MAX\(pi\.codigo\)/gi) ?? []).length).toBe(2);
  });
});
