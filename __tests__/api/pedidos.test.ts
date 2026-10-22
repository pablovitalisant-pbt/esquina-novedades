/**
 * @jest-environment node
 *
 * Fase B — Slice Pedidos públicos (Schema + API).
 * Tests que fuerzan las condiciones de riesgo del contrato.
 */

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/pedidos/route';

const getServerSession = jest.fn();
const sql = jest.fn();
const sqlTransaction = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => {
  const mockSql = (...args: any[]) => sql(...args);
  mockSql.transaction = (...args: any[]) => sqlTransaction(...args);
  return { sql: mockSql };
});

function postReq(body: any): NextRequest {
  return new NextRequest('http://localhost/api/pedidos', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID_BODY = {
  nombre_contacto: 'Juana Pérez',
  telefono_contacto: '+591 700 12345',
  origen: 'productos',
  items: [
    { producto_id: 118, codigo: '1055', detalle: 'gallinita', cantidad: 2, precio_referencia: 4.5 },
  ],
};

describe('POST /api/pedidos — público (sin sesión)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Riesgo: validaciones → 400 sin tocar DB ─────────────────────
  test('nombre_contacto vacío → 400', async () => {
    const res = await POST(postReq({ ...VALID_BODY, nombre_contacto: '   ' }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  test('telefono_contacto vacío → 400', async () => {
    const res = await POST(postReq({ ...VALID_BODY, telefono_contacto: '' }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  test('items vacío → 400', async () => {
    const res = await POST(postReq({ ...VALID_BODY, items: [] }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  test('cantidad <= 0 → 400', async () => {
    const res = await POST(postReq({
      ...VALID_BODY,
      items: [{ ...VALID_BODY.items[0], cantidad: 0 }],
    }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  test('origen inválido → 400', async () => {
    const res = await POST(postReq({ ...VALID_BODY, origen: 'otro' }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  test('origen catalogo sin origen_slug → 400', async () => {
    const res = await POST(postReq({ ...VALID_BODY, origen: 'catalogo' }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  // ─── Riesgo: producto inexistente → 400, no inserta nada ─────────
  test('algún producto_id no existe → 400', async () => {
    sql.mockResolvedValueOnce([]); // productos check devuelve vacío
    const res = await POST(postReq(VALID_BODY));
    expect(res.status).toBe(400);
    expect(sqlTransaction).not.toHaveBeenCalled();
  });

  // ─── Riesgo: match de cliente por dígitos (no normaliza mal) ─────
  test('teléfono con formato matchea por dígitos exactos → 201 sin crear cliente nuevo (BUG-066)', async () => {
    // Guardado en DB con formato (+56920948874) y teléfono entrante también con
    // formato (+569 2094 8874): el regexp_replace debe limpiar AMBOS lados y
    // encontrar el cliente existente → NO insertar cliente nuevo.
    sql
      .mockResolvedValueOnce([{ id: 118 }])          // productos existen
      .mockResolvedValueOnce([{ id: 'a91c-0000' }]);  // client match por dígitos

    sqlTransaction.mockResolvedValueOnce([
      [{ id: 'b3f1-0000', cliente_id: 'a91c-0000', estado: 'pendiente', created_at: '2026-08-17T20:10:00Z' }],
      [], // pedido_items
    ]);

    const res = await POST(postReq({ ...VALID_BODY, telefono_contacto: '+569 2094 8874' }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.cliente_id).toBe('a91c-0000');
    expect(body.data.estado).toBe('pendiente');

    // La query de match debe normalizar a dígitos con regexp_replace usando
    // '[^0-9]' (sin backslash, el driver de Neon no lo mangla). BUG-066.
    const matchQuery = sql.mock.calls[1][0].join('');
    expect(matchQuery).toMatch(/regexp_replace\(telefono, '\[\^0-9\]'/);
    expect(matchQuery).not.toContain("'\\D'");
    // Caso match: NO se inserta cliente → transacción con 2 queries (pedido + item)
    expect(sqlTransaction.mock.calls[0][0].length).toBe(2);
  });

  // ─── Riesgo: sin match → crea cliente (standalone, fuera de la transacción) ──
  test('sin match de teléfono → inserta cliente + pedido + items → 201', async () => {
    sql
      .mockResolvedValueOnce([{ id: 118 }])   // productos existen
      .mockResolvedValueOnce([])               // sin match de cliente
      .mockResolvedValueOnce([{ id: 'cli-nuevo' }]); // INSERT cliente standalone OK

    sqlTransaction.mockResolvedValueOnce([
      [{ id: 'b3f1-0000', cliente_id: 'cli-nuevo', estado: 'pendiente', created_at: '2026-08-17T20:10:00Z' }], // pedido
      [],                                                           // pedido_items
    ]);

    const res = await POST(postReq(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.cliente_id).toBe('cli-nuevo');
    // Slice unicidad: el INSERT de cliente es standalone (sql, no transacción)
    // para poder capturar 23505. La transacción tiene solo pedido + items.
    expect(sqlTransaction.mock.calls[0][0].length).toBe(2);
  });

  // ─── Riesgo: carrera — INSERT cliente choca con 23505 → reutiliza el existente ──
  test('concurrente: INSERT cliente choca 23505 → reutiliza el cliente existente, el pedido no falla', async () => {
    sql
      .mockResolvedValueOnce([{ id: 118 }])              // productos existen
      .mockResolvedValueOnce([])                          // sin match (dos requests, ninguno creó aún)
      .mockRejectedValueOnce({ code: '23505' })           // INSERT cliente: otro request lo creó primero
      .mockResolvedValueOnce([{ id: 'a91c-0000' }]);      // re-SELECT: cliente existente por teléfono

    sqlTransaction.mockResolvedValueOnce([
      [{ id: 'b3f1-0000', cliente_id: 'a91c-0000', estado: 'pendiente', created_at: '2026-08-17T20:10:00Z' }],
      [],
    ]);

    const res = await POST(postReq(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(201); // el pedido NUNCA falla por duplicado de cliente
    expect(body.data.cliente_id).toBe('a91c-0000'); // reutiliza el existente, no duplica
  });

  // ─── Riesgo: catalogo con slug válido → 201 ──────────────────────
  test('origen catalogo con slug → 201', async () => {
    sql
      .mockResolvedValueOnce([{ id: 118 }])
      .mockResolvedValueOnce([{ id: 'a91c-0000' }]);

    sqlTransaction.mockResolvedValueOnce([
      [{ id: 'b3f1-0000', cliente_id: 'a91c-0000', estado: 'pendiente', created_at: '2026-08-17T20:10:00Z' }],
      [],
    ]);

    const res = await POST(postReq({ ...VALID_BODY, origen: 'catalogo', origen_slug: 'juguetes' }));
    expect(res.status).toBe(201);
  });
});

describe('GET /api/pedidos — staff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sin sesión → 401', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/api/pedidos'));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  test('rol bodeguero → 403', async () => {
    getServerSession.mockResolvedValue({ user: { rol: 'bodeguero' } });
    const res = await GET(new NextRequest('http://localhost/api/pedidos'));
    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  test('con sesión válida → lista pedidos con items agrupados y cantcaja', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });

    sql
      .mockResolvedValueOnce([]) // fragmento condicional anidado (valor descartado)
      .mockResolvedValueOnce([
        {
          id: 'b3f1-0000', cliente_id: 'a91c-0000', origen: 'productos', origen_slug: null,
          estado: 'pendiente', created_at: '2026-08-17T20:10:00Z', nombre: 'Juana Pérez', telefono: '+591 700 12345',
        },
      ])
      .mockResolvedValueOnce([
        { pedido_id: 'b3f1-0000', codigo: '1055', detalle: 'gallinita', cantidad: 2, precio_referencia: 4.5, cantcaja: 30 },
      ]);

    const res = await GET(new NextRequest('http://localhost/api/pedidos'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].cliente).toEqual({
      id: 'a91c-0000', nombre: 'Juana Pérez', telefono: '+591 700 12345',
    });
    expect(body.data[0].items).toEqual([
      { codigo: '1055', detalle: 'gallinita', cantidad: 2, precio_referencia: 4.5, cantcaja: 30 },
    ]);
  });

  test('producto borrado tras el pedido → item se conserva con cantcaja null (LEFT JOIN)', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });

    sql
      .mockResolvedValueOnce([]) // fragmento condicional anidado (valor descartado)
      .mockResolvedValueOnce([
        {
          id: 'b3f1-0000', cliente_id: 'a91c-0000', origen: 'productos', origen_slug: null,
          estado: 'pendiente', created_at: '2026-08-17T20:10:00Z', nombre: 'Juana Pérez', telefono: '+591 700 12345',
        },
      ])
      .mockResolvedValueOnce([
        { pedido_id: 'b3f1-0000', codigo: '1055', detalle: 'gallinita', cantidad: 2, precio_referencia: 4.5, cantcaja: null },
      ]);

    const res = await GET(new NextRequest('http://localhost/api/pedidos'));
    const body = await res.json();

    expect(res.status).toBe(200);
    // LEFT JOIN: el item no desaparece aunque el producto ya no exista
    expect(body.data[0].items).toEqual([
      { codigo: '1055', detalle: 'gallinita', cantidad: 2, precio_referencia: 4.5, cantcaja: null },
    ]);
  });

  test('con ?estado=pendiente filtra la query', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'vendedor' } });

    sql
      .mockResolvedValueOnce([]) // fragmento condicional anidado (valor descartado)
      .mockResolvedValueOnce([]); // pedidos vacío → data vacío

    const res = await GET(new NextRequest('http://localhost/api/pedidos?estado=pendiente'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    const pedidosQuery = sql.mock.calls[0][0].join('');
    expect(pedidosQuery).toMatch(/estado/);
  });
});
