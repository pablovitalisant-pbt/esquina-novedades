/**
 * @jest-environment node
 *
 * Fase B — Slice: unicidad de clientes por teléfono (normalizado a dígitos).
 * Tests que intentan romper el slice.
 *
 * Riesgos cubiertos:
 * [x] INSERT duplicado (23505) → 409 con el nombre del cliente existente
 * [x] PATCH que colisiona el teléfono con otro cliente → 409
 * [x] Teléfono con formato distinto pero mismos dígitos → mismo cliente
 * [x] Alta normal sin conflicto → sigue funcionando (smoke)
 *
 * Patrón: mock de `sql` (unit). El 23505 se simula con mockRejectedValueOnce.
 */

import { NextRequest } from 'next/server';

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/db', () => ({ sql: (...args: any[]) => sql(...args) }));

import { POST as ClientePOST } from '@/app/api/clientes/route';
import { PATCH as ClientePATCH } from '@/app/api/clientes/[id]/route';

const sesionAdmin = { user: { id: '7', rol: 'admin' } };

function postReq(body: any): NextRequest {
  return new NextRequest('http://localhost/api/clientes', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function patchReq(id: string, body: any): NextRequest {
  return new NextRequest(`http://localhost/api/clientes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/clientes — duplicado por teléfono normalizado', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getServerSession.mockResolvedValue(sesionAdmin);
  });

  test('TEST 1: teléfono duplicado exacto → 409 con nombre del cliente existente', async () => {
    // INSERT cliente choca con 23505 → se busca el existente por teléfono.
    sql.mockRejectedValueOnce({ code: '23505' });
    sql.mockResolvedValueOnce([{ id: 'c-1', nombre: 'Juana Pérez' }]);
    const res = await ClientePOST(postReq({ nombre: 'Otro', telefono: '59170012345' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/Ya existe un cliente con este teléfono: Juana Pérez/);
  });

  test('TEST 4: teléfono con formato distinto pero mismos dígitos → 409', async () => {
    // Guardado: "591 700-12345"; entrante: "+591 700 12345" → mismos dígitos 59170012345.
    sql.mockRejectedValueOnce({ code: '23505' });
    sql.mockResolvedValueOnce([{ id: 'c-1', nombre: 'Juana Pérez' }]);
    const res = await ClientePOST(postReq({ nombre: 'Otro', telefono: '+591 700 12345' }));
    expect(res.status).toBe(409);
    // La búsqueda del existente normaliza a dígitos con regexp_replace (el
    // valor bindeado va como parámetro, no como literal en el texto SQL).
    const matchQuery = sql.mock.calls[1][0].join('');
    expect(matchQuery).toMatch(/regexp_replace\(telefono/);
    expect(matchQuery).toMatch(/\[\^0-9\]/);
  });

  test('TEST 5: alta normal sin conflicto → 201 (smoke)', async () => {
    sql.mockResolvedValueOnce([
      { id: 'c-nuevo', nombre: 'Nuevo', telefono: '59170099999', direccion: null, notas: null, created_at: '2026-08-18' },
    ]);
    const res = await ClientePOST(postReq({ nombre: 'Nuevo', telefono: '59170099999' }));
    expect(res.status).toBe(201);
  });
});

describe('PATCH /api/clientes/[id] — colisión de teléfono', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getServerSession.mockResolvedValue(sesionAdmin);
  });

  test('TEST 2: PATCH edita teléfono a uno de otro cliente → 409 con su nombre', async () => {
    // UPDATE choca con 23505 → se busca el otro cliente por teléfono normalizado.
    sql.mockRejectedValueOnce({ code: '23505' });
    sql.mockResolvedValueOnce([{ id: 'c-otro', nombre: 'Pedro Gómez' }]);
    const res = await ClientePATCH(patchReq('c-1', { telefono: '59170012345' }), { params: Promise.resolve({ id: 'c-1' }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/Ya existe un cliente con este teléfono: Pedro Gómez/);
  });

  test('TEST 2b: PATCH sin conflicto → 200', async () => {
    sql.mockResolvedValueOnce([
      { id: 'c-1', nombre: 'Juana', telefono: '59170011111', direccion: null, notas: null, created_at: '2026-08-18' },
    ]);
    const res = await ClientePATCH(patchReq('c-1', { telefono: '59170011111' }), { params: Promise.resolve({ id: 'c-1' }) });
    expect(res.status).toBe(200);
  });
});
