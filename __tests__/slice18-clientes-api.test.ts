/**
 * @jest-environment node
 *
 * Fase B — Slice 18: Tests que intentan romper la API de clientes.
 *
 * Contrato: GET /api/clientes (listar + busqueda), POST (crear),
 * GET/PATCH/DELETE /api/clientes/[id]. DELETE con FK RESTRICT → 409.
 */

import { NextRequest } from 'next/server';

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sql(...args),
}));

let GET: Function, POST: Function, GET_ID: Function, PATCH: Function, DELETE_ID: Function;

beforeAll(async () => {
  const list = await import('@/app/api/clientes/route');
  GET = list.GET;
  POST = list.POST;
  const detail = await import('@/app/api/clientes/[id]/route');
  GET_ID = detail.GET;
  PATCH = detail.PATCH;
  DELETE_ID = detail.DELETE;
});

function adminSession() {
  getServerSession.mockResolvedValue({ user: { id: '1', rol: 'admin' } });
}

function noSession() {
  getServerSession.mockResolvedValue(null);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ──── GET /api/clientes ────

describe('GET /api/clientes', () => {
  test('sin sesión → 401', async () => {
    noSession();
    const req = new NextRequest('http://localhost/api/clientes');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  test('con sesión → 200 y array data', async () => {
    adminSession();
    sql.mockResolvedValue([{ id: 1, nombre: 'Juan', telefono: '123', direccion: null, notas: null }]);
    const req = new NextRequest('http://localhost/api/clientes');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('con query ?q= → filtra por nombre', async () => {
    adminSession();
    sql.mockResolvedValue([{ id: 2, nombre: 'Maria', telefono: '456', direccion: 'Calle 1', notas: 'Buena cliente' }]);
    const req = new NextRequest('http://localhost/api/clientes?q=Maria');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].nombre).toBe('Maria');
  });
});

// ──── POST /api/clientes ────

describe('POST /api/clientes', () => {
  test('sin sesión → 401', async () => {
    noSession();
    const req = new NextRequest('http://localhost/api/clientes', {
      method: 'POST',
      body: JSON.stringify({ nombre: 'Test', telefono: '123' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  test('sin nombre → 400', async () => {
    adminSession();
    const req = new NextRequest('http://localhost/api/clientes', {
      method: 'POST',
      body: JSON.stringify({ telefono: '123' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('con nombre válido → 201 y retorna el cliente creado', async () => {
    adminSession();
    sql.mockResolvedValue([{ id: 1, nombre: 'Nuevo', telefono: '123', direccion: null, notas: null, created_at: '2025-01-01' }]);
    const req = new NextRequest('http://localhost/api/clientes', {
      method: 'POST',
      body: JSON.stringify({ nombre: 'Nuevo', telefono: '123' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe(1);
    expect(body.data.nombre).toBe('Nuevo');
  });
});

// ──── DELETE /api/clientes/[id] — FK RESTRICT ────

describe('DELETE /api/clientes/[id]', () => {
  test('sin sesión → 401', async () => {
    noSession();
    const req = new NextRequest('http://localhost/api/clientes/1', { method: 'DELETE' });
    const res = await DELETE_ID(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(401);
  });

  test('cliente inexistente → 404', async () => {
    adminSession();
    sql.mockResolvedValueOnce([]); // check existence
    const req = new NextRequest('http://localhost/api/clientes/99', { method: 'DELETE' });
    const res = await DELETE_ID(req, { params: Promise.resolve({ id: '99' }) });
    expect(res.status).toBe(404);
  });

  test('cliente con notas asociadas → 409 (FK RESTRICT 23503)', async () => {
    adminSession();
    sql.mockResolvedValueOnce([{ id: 1, nombre: 'Juan' }]); // existe
    const fkError = Object.assign(new Error('foreign_key_violation'), { code: '23503' });
    sql.mockRejectedValueOnce(fkError);
    const req = new NextRequest('http://localhost/api/clientes/1', { method: 'DELETE' });
    const res = await DELETE_ID(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(409);
  });

  test('cliente con notas asociadas → 409 (RESTRICT violation 23001)', async () => {
    adminSession();
    sql.mockResolvedValueOnce([{ id: 1, nombre: 'Juan' }]); // existe
    // Postgres RESTRICT violation: error code 23001 (diferente de 23503)
    const restrictError = Object.assign(new Error('restrict_violation'), { code: '23001' });
    sql.mockRejectedValueOnce(restrictError);
    const req = new NextRequest('http://localhost/api/clientes/1', { method: 'DELETE' });
    const res = await DELETE_ID(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('No se puede eliminar: el cliente tiene notas de venta asociadas');
  });

  test('cliente sin notas → 200 y eliminado', async () => {
    adminSession();
    sql.mockResolvedValueOnce([{ id: 2, nombre: 'SinNotas' }]); // existe
    sql.mockResolvedValueOnce([]);                              // prenotas lookup → vacío
    sql.mockResolvedValueOnce([{ id: 2 }]);                     // DELETE cliente exitoso
    const req = new NextRequest('http://localhost/api/clientes/2', { method: 'DELETE' });
    const res = await DELETE_ID(req, { params: Promise.resolve({ id: '2' }) });
    expect(res.status).toBe(200);
  });

  // ──── Tests Fase B: DELETE condicional por estado de prenotas ────

  test('[FaseB] cliente con nota activa → 409 (regresión)', async () => {
    adminSession();
    sql.mockResolvedValueOnce([{ id: 1 }]);               // existe
    sql.mockResolvedValueOnce([{ id: 33, estado: 'activa' }]); // prenotas lookup → activa
    const req = new NextRequest('http://localhost/api/clientes/1', { method: 'DELETE' });
    const res = await DELETE_ID(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(409);
  });

  test('[FaseB] cliente con solo notas anuladas → 200', async () => {
    adminSession();
    sql.mockResolvedValueOnce([{ id: 6 }]);                // existe
    sql.mockResolvedValueOnce([{ id: 33, estado: 'anulada' }]); // prenotas lookup
    sql.mockResolvedValueOnce([]);                         // caja check → vacío
    sql.mockResolvedValueOnce([{ id: 33 }]);               // DELETE prenotas
    sql.mockResolvedValueOnce([{ id: 6 }]);                // DELETE cliente
    const req = new NextRequest('http://localhost/api/clientes/6', { method: 'DELETE' });
    const res = await DELETE_ID(req, { params: Promise.resolve({ id: '6' }) });
    expect(res.status).toBe(200);
  });

  test('[FaseB] cliente con nota anulada + caja_movimiento_notas → 409 con mensaje específico', async () => {
    adminSession();
    sql.mockResolvedValueOnce([{ id: 6 }]);                // existe
    sql.mockResolvedValueOnce([{ id: 33, estado: 'anulada' }]); // prenotas lookup
    sql.mockResolvedValueOnce([{ 1: 1 }]);                 // caja check → hay fila
    const req = new NextRequest('http://localhost/api/clientes/6', { method: 'DELETE' });
    const res = await DELETE_ID(req, { params: Promise.resolve({ id: '6' }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('No se puede eliminar: existen movimientos de caja asociados a notas anuladas de este cliente');
  });

  test('[FaseB] cliente sin ninguna prenota asociada → 200 (smoke)', async () => {
    adminSession();
    sql.mockResolvedValueOnce([{ id: 7 }]);                // existe
    sql.mockResolvedValueOnce([]);                         // prenotas lookup → vacío
    sql.mockResolvedValueOnce([{ id: 7 }]);                // DELETE cliente
    const req = new NextRequest('http://localhost/api/clientes/7', { method: 'DELETE' });
    const res = await DELETE_ID(req, { params: Promise.resolve({ id: '7' }) });
    expect(res.status).toBe(200);
  });
});
