/**
 * @jest-environment node
 *
 * Fase B — Simplificación módulo Bodega.
 * Tests para PUT /api/ubicaciones/codigo/[codigo] (R2 exclusivamente).
 *
 * El import estático de PUT arriba es la señal RED: si el endpoint no
 * existe (Fase B), el import falla y este suite entero NO CARGA con
 * "Cannot find module". Ese es el estado correcto — el test exige que
 * el endpoint exista para poder correr.
 *
 * En Fase C, al crear app/api/ubicaciones/codigo/[codigo]/route.ts,
 * este import se resuelve y los tests verifican la validación.
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

// Import estático — si el archivo no existe, este suite falla al cargar.
// Ese es el estado RED correcto y esperado para Fase B.
import { PUT } from '../../app/api/ubicaciones/codigo/[codigo]/route';

function makePutRequest(codigo: string, body: any) {
  return {
    request: new Request(`http://localhost/api/ubicaciones/codigo/${codigo}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ codigo }),
  };
}

describe('R2 — PUT /api/ubicaciones/codigo/[codigo] valida producto existente', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'admin', empresas: [1] } });
  });

  it('rechaza con 400 cuando el código no existe en productos', async () => {
    // Mock: SELECT 1 FROM productos → vacío (producto no existe)
    sql.mockResolvedValueOnce([]);

    const { request, params } = makePutRequest('CODIGO-INEXISTENTE', {
      ubicacion: 'A-01',
      fisico_cajas: 2,
      fisico_unidades: 0,
    });
    const res = await PUT(request, { params });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/producto|exist|no encontrado/i);

    // Verificar que NO se intentó el INSERT/upsert
    const upsertCall = sql.mock.calls.find((call: any) => {
      const chunks = call[0];
      return Array.isArray(chunks) && chunks.join('').match(/INSERT|ON CONFLICT/i);
    });
    expect(upsertCall).toBeUndefined();
  });

  it('acepta con 200 cuando el código existe y hace upsert', async () => {
    // Mock: producto EXISTE
    sql.mockResolvedValueOnce([{ id: 1 }]); // SELECT 1 FROM productos → existe
    // Mock: upsert exitoso
    sql.mockResolvedValueOnce([{
      id: 99,
      codigo: 'H900',
      ubicacion: 'A-01',
      fisico: 24,
      diferencia: 9,
      saldo: 15,
      observaciones: null,
    }]);

    const { request, params } = makePutRequest('H900', {
      ubicacion: 'A-01',
      fisico_cajas: 2,
      fisico_unidades: 0,
    });
    const res = await PUT(request, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.codigo).toBe('H900');
    expect(body.data.ubicacion).toBe('A-01');
  });
});
