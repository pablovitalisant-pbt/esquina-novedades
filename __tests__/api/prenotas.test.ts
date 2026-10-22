/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/notas-venta/route';
import { GET as GET_DETAIL, PATCH, DELETE } from '@/app/api/notas-venta/[id]/route';
import { POST as POST_ITEM } from '@/app/api/notas-venta/[id]/items/route';
import { PATCH as PATCH_ITEM, DELETE as DELETE_ITEM } from '@/app/api/notas-venta/[id]/items/[itemId]/route';

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

describe('GET /api/notas-venta', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sin sesión → 401', async () => {
    getServerSession.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/notas-venta');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: expect.any(String) });
  });

  test('con rol bodeguero → 403', async () => {
    getServerSession.mockResolvedValue({ user: { rol: 'bodeguero' } });

    const req = new NextRequest('http://localhost/api/notas-venta');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: expect.any(String) });
  });

  test('con sesión válida → retorna lista de prenotas del usuario', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'vendedor' } });
    sql.mockResolvedValue([
      { id: 1, titulo: 'PRE-NOTA JUAN', user_id: 7, kcodclie: 100, nombre_cliente: 'JUAN PEREZ' },
    ]);

    const req = new NextRequest('http://localhost/api/notas-venta');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: 1, titulo: 'PRE-NOTA JUAN', user_id: 7, kcodclie: 100, nombre_cliente: 'JUAN PEREZ',
    });
    // New aggregated fields present
    expect(body.data[0]).toHaveProperty('total');
    expect(body.data[0]).toHaveProperty('total_pagado');
    expect(body.data[0]).toHaveProperty('saldo_pendiente');
  });
});

describe('POST /api/notas-venta', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('con sesión válida → crea prenota y retorna objeto con id y titulo', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'vendedor' } });
    sql.mockResolvedValue([{ id: 10, titulo: 'PRE-NOTA NUEVA' }]);

    const req = new NextRequest('http://localhost/api/notas-venta', {
      method: 'POST',
      body: JSON.stringify({ titulo: 'PRE-NOTA NUEVA' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ id: 10, titulo: 'PRE-NOTA NUEVA' });
  });
});

describe('GET /api/notas-venta/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('con sesión válida → retorna prenota con items', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });
    sql
      .mockResolvedValueOnce([{ id: 10, titulo: 'PRE-NOTA JUAN', kcodclie: 100, nombre_cliente: 'JUAN PEREZ' }])
      .mockResolvedValueOnce([{ id: 1, codigo: 'ABC123', detalle: 'Producto Test', cajas: 2, unidades: 12, precio: 150, subtotal: '1800.00' }])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ total: 0 }]);

    const req = new NextRequest('http://localhost/api/notas-venta/10');
    const res = await GET_DETAIL(req, { params: Promise.resolve({ id: '10' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      id: 10,
      titulo: 'PRE-NOTA JUAN',
      kcodclie: 100,
      nombre_cliente: 'JUAN PEREZ',
      items: [
        { id: 1, codigo: 'ABC123', detalle: 'Producto Test', cajas: 2, unidades: 12, precio: 150, subtotal: '1800.00' },
      ],
      total: 1800,
      tipo: 'menor',
      total_pagado: 0,
      saldo_favor_aplicado: 0,
      saldo_pendiente: 1800,
      cliente_saldo_favor: 0,
    });
  });
});

describe('PATCH /api/notas-venta/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('asignar cliente → actualiza kcodclie, nombre_cliente y titulo', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'vendedor' } });
    sql.mockResolvedValue([
      { id: 10, kcodclie: 100, nombre_cliente: 'JUAN PEREZ', titulo: 'PRE-NOTA JUAN PEREZ' },
    ]);

    const req = new NextRequest('http://localhost/api/notas-venta/10', {
      method: 'PATCH',
      body: JSON.stringify({ kcodclie: 100, nombre_cliente: 'JUAN PEREZ', titulo: 'PRE-NOTA JUAN PEREZ' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: '10' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      id: 10,
      kcodclie: 100,
      nombre_cliente: 'JUAN PEREZ',
      titulo: 'PRE-NOTA JUAN PEREZ',
    });
  });
});

describe('DELETE /api/notas-venta/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('con sesión válida → anula prenota sin pagos y retorna ok', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });
    sql.mockResolvedValueOnce([{ total: '0' }]);    // 1. SUM check
    // 2. Transaccion atómica: lock + updateEstado + 2 updates de stock (no-op sin items)
    sqlTransaction.mockResolvedValueOnce([
      [{ id: 10 }],  // lock FOR UPDATE
      [{ id: 10 }],  // UPDATE estado RETURNING id
      [],            // UPDATE productos
      [],            // UPDATE ub_bodega
    ]);

    const req = new NextRequest('http://localhost/api/notas-venta/10', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: '10' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});

describe('POST /api/notas-venta/[id]/items', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('agrega item → retorna item creado', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'vendedor' } });
    sql
      .mockResolvedValueOnce([{ estado: 'activa' }])         // checkNotaActiva
      .mockResolvedValueOnce([{ liberados: 0, unidades: 0 }]) // liberación perezosa (8c)
      .mockResolvedValueOnce([{ saldo: 100 }])                // UPDATE stock
      .mockResolvedValueOnce([])                               // UPDATE ub_bodega
      .mockResolvedValueOnce([                                 // INSERT item
        { id: 55, codigo: 'ABC123', detalle: 'Producto Test', cajas: 1, unidades: 6, precio: 150 },
      ])
      .mockResolvedValueOnce([]);                              // UPDATE prenotas

    const req = new NextRequest('http://localhost/api/notas-venta/10/items', {
      method: 'POST',
      body: JSON.stringify({ codigo: 'ABC123', detalle: 'Producto Test', cajas: 1, unidades: 6, precio: 150 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST_ITEM(req, { params: Promise.resolve({ id: '10' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ id: 55, codigo: 'ABC123', detalle: 'Producto Test', cajas: 1, unidades: 6, precio: 150 });
  });
});

describe('PATCH /api/notas-venta/[id]/items/[itemId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('actualiza cajas/unidades/precio → retorna item actualizado', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'vendedor' } });
    sql
      .mockResolvedValueOnce([{ estado: 'activa' }])                  // checkNotaActiva
      .mockResolvedValueOnce([{ unidades: 10, codigo: 'ABC123', empresa_id: 1 }]) // leer item actual
      .mockResolvedValueOnce([{ saldo: 200 }])                         // UPDATE stock (delta=8)
      .mockResolvedValueOnce([])                                        // UPDATE ub_bodega
      .mockResolvedValueOnce([                                          // UPDATE prenota_items
        { id: 55, cajas: 3, unidades: 18, precio: 145 },
      ]);

    const req = new NextRequest('http://localhost/api/notas-venta/10/items/55', {
      method: 'PATCH',
      body: JSON.stringify({ cajas: 3, unidades: 18, precio: 145 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PATCH_ITEM(req, { params: Promise.resolve({ id: '10', itemId: '55' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ id: 55, cajas: 3, unidades: 18, precio: 145 });
  });
});

describe('DELETE /api/notas-venta/[id]/items/[itemId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('elimina item → retorna ok', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });
    // Transaccion atómica: lock + guard + restore + delete (sin calls de sql directas)
    sqlTransaction.mockResolvedValueOnce([
      [{ id: 10 }],   // lock FOR UPDATE
      [{ guard: 1 }], // guard (nota activa + item existe)
      [],             // UPDATE productos
      [],             // UPDATE ub_bodega
      [],             // DELETE prenota_item
    ]);

    const req = new NextRequest('http://localhost/api/notas-venta/10/items/55', { method: 'DELETE' });
    const res = await DELETE_ITEM(req, { params: Promise.resolve({ id: '10', itemId: '55' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Fase B — Slice Notas de Venta (cliente_id + limpieza Zofri)
// Estos tests DEBEN fallar contra el código actual (sin el fix).
// ═══════════════════════════════════════════════════════════════════

describe('FASE B — PATCH /api/notas-venta/[id] con cliente_id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Riesgo 1: cliente_id inexistente → 400 ──────────────────
  test('PATCH con cliente_id inexistente → 400 (hoy: ignora y retorna 200)', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'vendedor' } });

    // Mock: current prenota lookup (titulo_base)
    sql.mockResolvedValueOnce([{ titulo_base: 'Pre-nota #1 — 04-jul-2026' }]);

    // Mock: cliente lookup — empty (no existe)
    sql.mockResolvedValueOnce([]);

    const req = new NextRequest('http://localhost/api/notas-venta/10', {
      method: 'PATCH',
      body: JSON.stringify({ cliente_id: 999 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: '10' }) });
    const body = await res.json();

    // Después del fix: debe rechazar con 400
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/cliente/i);
  });

  // ─── Riesgo 1b: cliente_id null → quita cliente ──────────────
  test('PATCH con cliente_id null → quita cliente (debe funcionar)', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'vendedor' } });

    sql.mockResolvedValueOnce([{ titulo_base: 'Pre-nota #1', cliente_id: 5 }]);
    sql.mockResolvedValueOnce([
      { id: 10, cliente_id: null, nombre_cliente: null, titulo: 'Pre-nota #1' },
    ]);

    const req = new NextRequest('http://localhost/api/notas-venta/10', {
      method: 'PATCH',
      body: JSON.stringify({ cliente_id: null }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: '10' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cliente_id).toBeNull();
    expect(body.nombre_cliente).toBeNull();
  });
});

describe('FASE B — GET /api/notas-venta/[id] con cliente_nombre', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Riesgo 2: GET con LEFT JOIN devuelve cliente_nombre ─────
  test('GET hace LEFT JOIN a public.clientes (hoy: no hay JOIN)', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });

    // Mock: prenota con cliente_id asignado + cliente_nombre vía LEFT JOIN
    sql.mockResolvedValueOnce([
      {
        id: 10,
        titulo: 'Pre-nota #1',
        cliente_id: 5,
        nombre_cliente: 'Juan Pérez',
        cliente_nombre: 'Juan Pérez',
      },
    ]);
    sql.mockResolvedValueOnce([]); // items
    sql.mockResolvedValueOnce([{ total: 0 }]); // total_pagado

    const req = new NextRequest('http://localhost/api/notas-venta/10');
    const res = await GET_DETAIL(req, { params: Promise.resolve({ id: '10' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    // Después del fix: la query SQL debe incluir LEFT JOIN public.clientes
    const sqlCalls = sql.mock.calls;
    const getQueryTemplates = sqlCalls[0][0]; // template strings array del primer sql``
    const joinedQuery = getQueryTemplates.join('');
    expect(joinedQuery).toMatch(/LEFT\s+JOIN\s+public\.clientes/i);
    // Y el body debe incluir cliente_nombre vía JOIN
    expect(body).toHaveProperty('cliente_nombre');
  });

  // ─── Riesgo 2b: LEFT JOIN con cliente_id NULL ─────────────────
  test('GET con cliente_id NULL → cliente_nombre es null (no rompe)', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin' } });

    // Mock: prenota sin cliente_id — LEFT JOIN devuelve null
    sql.mockResolvedValueOnce([
      {
        id: 11,
        titulo: 'Pre-nota #2',
        cliente_id: null,
        nombre_cliente: null,
        cliente_nombre: null,
      },
    ]);
    sql.mockResolvedValueOnce([]);
    sql.mockResolvedValueOnce([{ total: 0 }]);

    const req = new NextRequest('http://localhost/api/notas-venta/11');
    const res = await GET_DETAIL(req, { params: Promise.resolve({ id: '11' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cliente_nombre).toBeNull();
    expect(body.cliente_id).toBeNull();
  });
});

describe('FASE B — compatibilidad con body legacy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Riesgo 4: body legacy no rompe ──────────────────────────
  test('PATCH con body legacy (kcodclie, tipo_documento, kcodclie_factura) no falla', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'vendedor' } });

    // Mock: current lookup
    sql.mockResolvedValueOnce([
      { titulo_base: 'Pre-nota #1', cliente_id: null },
    ]);
    // Mock: UPDATE RETURNING
    sql.mockResolvedValueOnce([
      {
        id: 10,
        cliente_id: null,
        nombre_cliente: null,
        titulo: 'Pre-nota #1',
      },
    ]);

    // Body viejo — campos que el nuevo PATCH ignora
    const req = new NextRequest('http://localhost/api/notas-venta/10', {
      method: 'PATCH',
      body: JSON.stringify({
        kcodclie: 100,
        nombre_cliente: 'JUAN PEREZ',
        tipo_documento: 'SRF',
        kcodclie_factura: 200,
        nombre_cliente_factura: 'EMPRESA X',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: '10' }) });

    // No debe romper — retorna 200 (aunque los campos legacy se ignoren)
    expect(res.status).toBe(200);
  });
});

describe('FASE B — smoke E2E: crear → asignar cliente → verificar JOIN → quitar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('flujo completo: POST con cliente_id, GET con cliente_nombre, PATCH quitar', async () => {
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'vendedor' } });

    // ─── Paso 1: Crear nota con cliente_id ───
    sql.mockResolvedValueOnce([{ count: '0' }]); // COUNT
    sql.mockResolvedValueOnce([
      { id: 20, titulo: 'Pre-nota #1 — 04-jul-2026', titulo_base: 'Pre-nota #1 — 04-jul-2026', cliente_id: 5 },
    ]);

    const postReq = new NextRequest('http://localhost/api/notas-venta', {
      method: 'POST',
      body: JSON.stringify({ cliente_id: 5 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const postRes = await POST(postReq);
    const postBody = await postRes.json();
    expect(postRes.status).toBe(200);
    expect(postBody.cliente_id).toBe(5);

    // ─── Paso 2: GET con JOIN — verificar cliente_nombre ───
    sql.mockResolvedValueOnce([
      {
        id: 20,
        titulo: 'Pre-nota #1 — 04-jul-2026',
        cliente_id: 5,
        nombre_cliente: 'Juan Pérez',
        cliente_nombre: 'Juan Pérez',
      },
    ]);
    sql.mockResolvedValueOnce([]); // items
    sql.mockResolvedValueOnce([{ total: 0 }]); // total_pagado

    const getReq = new NextRequest('http://localhost/api/notas-venta/20');
    const getRes = await GET_DETAIL(getReq, { params: Promise.resolve({ id: '20' }) });
    const getBody = await getRes.json();
    expect(getRes.status).toBe(200);
    expect(getBody).toHaveProperty('cliente_nombre', 'Juan Pérez');

    // ─── Paso 3: Quitar cliente (cliente_id: null) ───
    sql.mockResolvedValueOnce([
      { titulo_base: 'Pre-nota #1 — 04-jul-2026', cliente_id: 5 },
    ]);
    sql.mockResolvedValueOnce([
      { id: 20, cliente_id: null, nombre_cliente: null, titulo: 'Pre-nota #1 — 04-jul-2026' },
    ]);

    const patchReq = new NextRequest('http://localhost/api/notas-venta/20', {
      method: 'PATCH',
      body: JSON.stringify({ cliente_id: null }),
      headers: { 'Content-Type': 'application/json' },
    });
    const patchRes = await PATCH(patchReq, { params: Promise.resolve({ id: '20' }) });
    const patchBody = await patchRes.json();
    expect(patchRes.status).toBe(200);
    expect(patchBody.cliente_id).toBeNull();
    expect(patchBody.nombre_cliente).toBeNull();
  });
});
