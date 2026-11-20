/**
 * @jest-environment node
 *
 * Fase B — S1a: PATCH /api/pedidos/[id]/entrega (marcar/desmarcar) y GET
 * /api/pedidos con entregado_en. Riesgos: doble envío, carrera entre dos
 * vendedoras, flag apagado, roles, estados no válidos, nombre desde la sesión
 * y pre-migración (flag apagado no menciona la columna).
 */

import { NextRequest } from 'next/server';
import { PATCH } from '@/app/api/pedidos/[id]/entrega/route';
import { GET } from '@/app/api/pedidos/route';

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => {
  const mockSql = (...args: any[]) => sql(...args);
  return { sql: mockSql };
});

jest.mock('@/config/feature-flags.json', () =>
  require('@/__tests__/helpers/mockFlags').mockFlags(),
);

const flagsMock = jest.requireMock('@/config/feature-flags.json') as Record<string, boolean>;

const ID = 'afb8e9f4-22d3-4a80-8f63-6efc18d3d45d';
const FECHA = '2026-11-19T23:10:04+00:00';

const ADMIN = { user: { id: '7', nombre: 'Paola', rol: 'admin' } };
const VENDEDOR = { user: { id: '9', nombre: 'Camila', rol: 'vendedor' } };

function request(body: any, id = ID): NextRequest {
  return new NextRequest(`http://localhost/api/pedidos/${id}/entrega`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });

const entregado = { id: ID, entregado_en: FECHA, entregado_por_nombre: 'Paola' };
const sinEntregar = { id: ID, estado: 'convertido', entregado_en: null, entregado_por_nombre: null };

const textos = () => sql.mock.calls.map((c: any[]) => c[0].join(''));
const actualizaciones = () => textos().filter((t: string) => t.includes('UPDATE public.pedidos'));

beforeEach(() => {
  jest.clearAllMocks();
  flagsMock['pedidos-entrega'] = true;
});
afterEach(() => {
  flagsMock['pedidos-entrega'] = false;
});

describe('PATCH /api/pedidos/[id]/entrega — acceso', () => {
  test('flag apagado → 404 y no toca la base', async () => {
    flagsMock['pedidos-entrega'] = false;
    getServerSession.mockResolvedValue(ADMIN);

    const res = await PATCH(request({ entregado: true }), ctx());

    expect(res.status).toBe(404);
    expect(sql).not.toHaveBeenCalled();
  });

  test('sin sesión → 401', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await PATCH(request({ entregado: true }), ctx());
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  test('bodeguero → 403 al marcar y al desmarcar', async () => {
    getServerSession.mockResolvedValue({ user: { id: '3', nombre: 'Bodega', rol: 'bodeguero' } });

    expect((await PATCH(request({ entregado: true }), ctx())).status).toBe(403);
    expect((await PATCH(request({ entregado: false }), ctx())).status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  test('vendedor marca (200); vendedor desmarca → 403 sin tocar la base', async () => {
    getServerSession.mockResolvedValue(VENDEDOR);
    sql.mockResolvedValueOnce([{ ...entregado, entregado_por_nombre: 'Camila' }]);

    const marca = await PATCH(request({ entregado: true }), ctx());
    expect(marca.status).toBe(200);

    sql.mockClear();
    const desmarca = await PATCH(request({ entregado: false }), ctx());
    expect(desmarca.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  test('body inválido → 400 sin tocar la base', async () => {
    getServerSession.mockResolvedValue(ADMIN);

    for (const body of [{}, { entregado: 'true' }, { entregado: 1 }, null]) {
      const res = await PATCH(request(body), ctx());
      expect(res.status).toBe(400);
    }
    expect(sql).not.toHaveBeenCalled();
  });

  test('UUID inválido → 400 sin tocar la base', async () => {
    getServerSession.mockResolvedValue(ADMIN);
    const res = await PATCH(request({ entregado: true }, 'pedido-1'), ctx('pedido-1'));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/pedidos/[id]/entrega — marcar', () => {
  test('convertido → 200 con fecha y nombre', async () => {
    getServerSession.mockResolvedValue(ADMIN);
    sql.mockResolvedValueOnce([entregado]);

    const res = await PATCH(request({ entregado: true }), ctx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ id: ID, entregado_en: FECHA, entregado_por_nombre: 'Paola' });
    expect(actualizaciones()[0]).toMatch(/entregado_en IS NULL/);
    expect(actualizaciones()[0]).toMatch(/estado IN \('convertido', 'pagado'\)/);
  });

  test('doble envío: el segundo no cambia la fecha del primero', async () => {
    getServerSession.mockResolvedValue(ADMIN);
    sql
      .mockResolvedValueOnce([entregado])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...entregado, estado: 'convertido' }]);

    const primero = await (await PATCH(request({ entregado: true }), ctx())).json();
    const segundo = await (await PATCH(request({ entregado: true }), ctx())).json();

    expect(segundo.data).toEqual(primero.data);
    expect(segundo.data.entregado_en).toBe(FECHA);
    const updates = actualizaciones();
    expect(updates).toHaveLength(2);
    for (const u of updates) expect(u).toMatch(/entregado_en IS NULL/);
  });

  test('carrera: si otra vendedora ganó, devuelve SU entrega sin sobrescribir', async () => {
    getServerSession.mockResolvedValue(VENDEDOR);
    sql
      .mockResolvedValueOnce([]) // el UPDATE condicionado pierde la carrera
      .mockResolvedValueOnce([{
        id: ID, estado: 'pagado', entregado_en: FECHA, entregado_por_nombre: 'Paola',
      }]);

    const res = await PATCH(request({ entregado: true }), ctx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ id: ID, entregado_en: FECHA, entregado_por_nombre: 'Paola' });
    expect(actualizaciones()).toHaveLength(1);
  });

  test.each(['pendiente', 'pendiente_pago', 'revision', 'descartado', 'expirado', 'rechazado'])(
    'estado %s → 409',
    async (estado) => {
      getServerSession.mockResolvedValue(ADMIN);
      sql
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: ID, estado, entregado_en: null, entregado_por_nombre: null }]);

      const res = await PATCH(request({ entregado: true }), ctx());
      expect(res.status).toBe(409);
    },
  );

  test('pedido inexistente → 404', async () => {
    getServerSession.mockResolvedValue(ADMIN);
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await PATCH(request({ entregado: true }), ctx());
    expect(res.status).toBe(404);
  });

  test('el nombre sale de la sesión, nunca del body', async () => {
    getServerSession.mockResolvedValue(ADMIN);
    sql.mockResolvedValueOnce([entregado]);

    await PATCH(request({ entregado: true, entregado_por_nombre: 'Invitado' }), ctx());

    const valores = sql.mock.calls[0].slice(1);
    expect(valores).toContain('Paola');
    expect(valores).not.toContain('Invitado');
  });

  test('id de sesión no entero → NULL (no rompe el FK de usuarios)', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'seed-admin', nombre: 'Paola', rol: 'admin' } });
    sql.mockResolvedValueOnce([entregado]);

    await PATCH(request({ entregado: true }), ctx());

    expect(sql.mock.calls[0].slice(1)).toContain(null);
  });

  test('id de sesión entero → se envía como número', async () => {
    getServerSession.mockResolvedValue(ADMIN);
    sql.mockResolvedValueOnce([entregado]);

    await PATCH(request({ entregado: true }), ctx());

    expect(sql.mock.calls[0].slice(1)).toContain(7);
  });
});

describe('PATCH /api/pedidos/[id]/entrega — desmarcar', () => {
  test('admin desmarca → 200 y la sentencia exige estar entregado', async () => {
    getServerSession.mockResolvedValue(ADMIN);
    sql.mockResolvedValueOnce([{ id: ID, entregado_en: null, entregado_por_nombre: null }]);

    const res = await PATCH(request({ entregado: false }), ctx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ id: ID, entregado_en: null, entregado_por_nombre: null });
    expect(actualizaciones()[0]).toMatch(/entregado_en IS NOT NULL/);
  });

  test('desmarcar un pedido no entregado es idempotente → 200', async () => {
    getServerSession.mockResolvedValue(ADMIN);
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([sinEntregar]);

    const res = await PATCH(request({ entregado: false }), ctx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.entregado_en).toBeNull();
  });

  test('desmarcar en estado no válido → 409', async () => {
    getServerSession.mockResolvedValue(ADMIN);
    sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: ID, estado: 'pendiente', entregado_en: null, entregado_por_nombre: null }]);

    const res = await PATCH(request({ entregado: false }), ctx());
    expect(res.status).toBe(409);
  });
});

describe('GET /api/pedidos — entrega', () => {
  const PEDIDO = {
    id: 'b3f1-0000', cliente_id: null, origen: 'productos', origen_slug: null,
    estado: 'convertido', created_at: '2026-11-19T20:10:00Z', total: 3000,
    email_contacto: null, entrega_codigo: 'retiro', entrega_costo: 0,
    direccion_entrega: null, nombre: null, telefono: null,
    stock_reservado: false, mp_payment_id: null, mp_fecha_pago: null, mp_revision_motivo: null,
  };
  const setup = (fila: Record<string, unknown>) => {
    sql.mockImplementation((strings: any[]) => {
      const t = strings.join('');
      if (t.includes('pedido_items')) return Promise.resolve([]);
      if (t.includes('FROM public.pedidos p')) return Promise.resolve([fila]);
      return Promise.resolve([]);
    });
  };
  const consultaPrincipal = () =>
    textos().find((t: string) => t.includes('FROM public.pedidos p')) ?? '';

  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue(ADMIN);
  });

  test('flag apagado: no menciona las columnas pre-migración y las expone en null', async () => {
    flagsMock['pedidos-entrega'] = false;
    setup(PEDIDO);

    const res = await GET(new NextRequest('http://localhost/api/pedidos'));
    const body = await res.json();

    expect(res.status).toBe(200);
    // Ninguna sentencia (ni el fragmento condicional) menciona la columna.
    for (const t of textos()) expect(t).not.toMatch(/entregado_en/);
    expect(body.data[0]).toHaveProperty('entregado_en', null);
    expect(body.data[0]).toHaveProperty('entregado_por_nombre', null);
  });

  test('flag encendido: selecciona y expone fecha y nombre', async () => {
    setup({ ...PEDIDO, entregado_en: FECHA, entregado_por_nombre: 'Paola' });

    const res = await GET(new NextRequest('http://localhost/api/pedidos'));
    const body = await res.json();

    expect(res.status).toBe(200);
    // Las columnas viajan en el fragmento anidado que se interpola en el SELECT.
    const fragmento = textos().find((t: string) => t.includes('entregado_en::text')) ?? '';
    expect(fragmento).toMatch(/entregado_en::text/);
    expect(fragmento).toMatch(/entregado_por_nombre/);
    expect(consultaPrincipal()).toMatch(/FROM public\.pedidos p/);
    expect(body.data[0]).toMatchObject({
      entregado_en: FECHA, entregado_por_nombre: 'Paola',
    });
  });
});
