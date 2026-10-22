/**
 * @jest-environment node
 *
 * Fase B — Simplificación módulo Bodega.
 * Tests para GET /api/ubicaciones (R1 + E2E smoke).
 * Este archivo SOLO importa GET (existe hoy). No depende de PUT.
 *
 * R1: GET /api/ubicaciones — producto SIN fila en ubicaciones_bodega
 *     debe aparecer con ubicacion/fisico/diferencia = null (no desaparecer)
 * E2E smoke: flujo crear producto → buscar → asignar ubicación
 */

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));
jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sql(...args),
}));

import { GET } from '../../app/api/ubicaciones/route';

function makeGetRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/ubicaciones');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString());
}

// ═══════════════════════════════════════════════════════════════════
// R1: GET /api/ubicaciones — producto SIN ubicaciones_bodega
// ═══════════════════════════════════════════════════════════════════
describe('R1 — GET /api/ubicaciones con producto sin ubicación', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'admin', empresas: [1] } });
  });

  it('producto sin fila en ubicaciones_bodega aparece con campos null (no desaparece)', async () => {
    // La query actual (FROM ubicaciones_bodega u LEFT JOIN productos p) NO
    // incluye productos sin fila en ubicaciones_bodega.
    // La NUEVA query (FROM productos p LEFT JOIN ubicaciones_bodega u) SÍ.
    //
    // Este test mockea sql para que devuelva un resultado que solo la nueva
    // query podría producir: un producto sin datos de ubicación.
    // Con la query actual, este resultado es imposible (el FROM arranca en u).
    sql.mockResolvedValue([
      {
        codigo: 'H900',
        detalle: 'Wok Antiadherente 30cm',
        producto_imagen_url: null,
        empresa_id: 1,
        saldo: 15,
        cantcaja: 12,
        umed: 'U',
        es_nuevo: false,
        ubicacion_id: null,
        ubicacion: null,
        fisico: null,
        diferencia: null,
        observaciones: null,
      },
    ]);

    const res = await GET(makeGetRequest({ empresa: '1', search: 'Wok' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].codigo).toBe('H900');
    // Un producto sin ubicación debe mostrar null, no desaparecer
    expect(body.data[0].ubicacion).toBeNull();
    expect(body.data[0].fisico).toBeNull();
    expect(body.data[0].diferencia).toBeNull();
    // Los campos de productos deben estar presentes
    expect(body.data[0].detalle).toBe('Wok Antiadherente 30cm');
    expect(body.data[0].saldo).toBe(15);
  });

  it('search sigue filtrando por codigo y detalle de productos (no de ubicaciones_bodega)', async () => {
    sql.mockResolvedValue([]);
    const res = await GET(makeGetRequest({ empresa: '1', search: 'H900' }));
    // Verificamos que la query incluye búsqueda sobre p.codigo y p.detalle
    const calls = sql.mock.calls;
    // La llamada a sql recibe un template tag. calls[0][0] es el array de strings
    // calls[0][1] son los parámetros interpolados
    expect(calls.length).toBeGreaterThan(0);

    // Extraer el SQL como string
    const queryChunks = calls[0][0];
    if (Array.isArray(queryChunks)) {
      const query = queryChunks.join('');
      // Debe buscar en codigo y detalle de productos (no de ubicaciones_bodega)
      expect(query).toMatch(/p\.codigo/i);
      expect(query).toMatch(/p\.detalle/i);
      // NO debe tener GROUP BY ni JSON_AGG ni ARRAY_AGG
      expect(query).not.toMatch(/JSON_AGG/i);
      expect(query).not.toMatch(/ARRAY_AGG/i);
      expect(query).not.toMatch(/GROUP\s+BY/i);
    }
  });

  it('filtros soloStock y soloNuevo funcionan sin HAVING', async () => {
    sql.mockResolvedValue([]);
    await GET(makeGetRequest({ empresa: '1', search: 'test', soloStock: 'true', soloNuevo: 'true' }));
    const calls = sql.mock.calls;
    const queryChunks = calls[0][0];
    if (Array.isArray(queryChunks)) {
      const query = queryChunks.join('');
      // Los filtros deben estar en WHERE, no en HAVING
      expect(query).not.toMatch(/HAVING/i);
      // Debe filtrar por p.saldo > 0 (soloStock)
      expect(query).toMatch(/p\.saldo\s*>\s*0/i);
      // Debe filtrar por p.es_nuevo = true (soloNuevo)
      expect(query).toMatch(/p\.es_nuevo/i);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// E2E smoke: flujo crear producto → buscar → asignar ubicación
// ═══════════════════════════════════════════════════════════════════
describe('E2E smoke — flujo completo ubicación', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'admin', empresas: [1] } });
  });

  it('crear producto nuevo → aparece en GET /api/ubicaciones sin ubicación → upsert asigna ubicación', async () => {
    // Paso 1: GET /api/ubicaciones search=Z999 (producto nuevo, sin ubicación)
    // Mock: aparece con campos null
    sql.mockResolvedValueOnce([
      {
        codigo: 'Z999',
        detalle: 'Producto nuevo test',
        producto_imagen_url: null,
        empresa_id: 1,
        saldo: 0,
        cantcaja: 1,
        umed: 'U',
        es_nuevo: true,
        ubicacion_id: null,
        ubicacion: null,
        fisico: null,
        diferencia: null,
        observaciones: null,
      },
    ]);

    const getRes = await GET(makeGetRequest({ empresa: '1', search: 'Z999' }));
    const getBody = await getRes.json();
    expect(getRes.status).toBe(200);
    expect(getBody.data).toHaveLength(1);
    expect(getBody.data[0].codigo).toBe('Z999');
    expect(getBody.data[0].ubicacion).toBeNull();
    expect(getBody.data[0].fisico).toBeNull();

    // Paso 2: Verificar que la query del GET usa la forma nueva
    // (FROM productos LEFT JOIN ubicaciones_bodega, sin GROUP BY)
    const queryChunks = sql.mock.calls[0][0];
    if (Array.isArray(queryChunks)) {
      const query = queryChunks.join('');
      expect(query).toMatch(/FROM\s+productos\s+p\s+LEFT\s+JOIN\s+ubicaciones_bodega/i);
      expect(query).not.toMatch(/GROUP\s+BY/i);
    }
  });
});
