/**
 * @jest-environment node
 *
 * FASE B — BUG-053: PATCH parcial en [id]/items/[itemId]/route.ts pisa con
 * NULL los campos ausentes en vez de conservar el valor existente.
 *
 * El UPDATE final (líneas 120-123) escribe:
 *   cajas = ${cajas !== null ? cajas : null},
 *   unidades = ${cantidadNueva !== undefined ? cantidadNueva : null},
 *   precio = ${precio !== null ? precio : null}
 * → si el body manda un solo campo (ej. {cajas: 5}), los otros dos se
 *   sobreescriben a NULL, perdiendo el valor real del ítem.
 * Y el SELECT (línea 65) solo trae unidades/codigo/empresa_id, así que ni
 * siquiera tiene cajas/precio disponibles para conservar.
 *
 * R1 (rojo): PATCH parcial {cajas: 5} → unidades y precio se conservan
 *   (2 y 31), NO se vuelven NULL. El fix requiere ampliar el SELECT y usar
 *   el valor existente como fallback.
 */

import { NextRequest } from 'next/server';

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/auth', () => ({ authOptions: {} }));

jest.mock('@/lib/db', () => {
  const mockSql = (...args: any[]) => sql(...args);
  mockSql.transaction = (...args: any[]) => sql(...args);
  return { sql: mockSql };
});

// Sesión válida: vendedor pasa validarSesion (solo bodeguero queda bloqueado).
const VENDEDOR = { user: { id: '1', rol: 'vendedor', nombre: 'Vendedor' } };

// Extrae los valores interpolados del UPDATE final (el que toca prenota_items).
function updateCall() {
  const call = sql.mock.calls.find((c: any[]) =>
    (c[0] as any[]).join('').includes('UPDATE public.prenota_items')
  );
  expect(call).toBeTruthy(); // el UPDATE debe haberse emitido
  return call as any[];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BUG-053 — PATCH parcial conserva campos ausentes', () => {
  it('R1: {unidades: 5} sin precio → conserva precio=31 y modalidad=detalle', async () => {
    getServerSession.mockResolvedValue(VENDEDOR);

    sql.mockResolvedValueOnce([{ estado: 'activa' }]);
    sql.mockResolvedValueOnce([{ unidades: 2, precio: 31, codigo: 'X-001', empresa_id: 1, modalidad: 'detalle' }]);
    sql.mockResolvedValueOnce([{ saldo: 100 }]);  // UPDATE stock (delta=3)
    sql.mockResolvedValueOnce([]);                // UPDATE ub_bodega
    sql.mockResolvedValueOnce([{ id: 'uuid-1', unidades: 5, precio: 31, modalidad: 'detalle' }]);

    const { PATCH } = await import('@/app/api/notas-venta/[id]/items/[itemId]/route');
    const res = await PATCH(
      new NextRequest('http://localhost/api/notas-venta/53/items/uuid-1', {
        method: 'PATCH',
        body: JSON.stringify({ unidades: 5 }),
      }),
      { params: Promise.resolve({ id: '53', itemId: 'uuid-1' }) }
    );

    expect(res.status).toBe(200);

    // Valores del UPDATE: [1]=modalidad, [2]=unidades, [3]=precio, [4]=itemId
    const call = updateCall();
    expect(call[1]).toBe('detalle');     // modalidad CONSERVADA
    expect(call[2]).toBe(5);             // unidades actualizada
    expect(call[3]).toBe(31);            // precio CONSERVADO (no null)
  });

  it('R1b: {precio: 40} sin unidades → conserva unidades=2 y modalidad', async () => {
    getServerSession.mockResolvedValue(VENDEDOR);

    sql.mockResolvedValueOnce([{ estado: 'activa' }]);
    sql.mockResolvedValueOnce([{ unidades: 2, precio: 31, codigo: 'X-001', empresa_id: 1, modalidad: 'mayor' }]);
    sql.mockResolvedValueOnce([{ id: 'uuid-1', unidades: 2, precio: 40, modalidad: 'mayor' }]);

    const { PATCH } = await import('@/app/api/notas-venta/[id]/items/[itemId]/route');
    const res = await PATCH(
      new NextRequest('http://localhost/api/notas-venta/53/items/uuid-1', {
        method: 'PATCH',
        body: JSON.stringify({ precio: 40 }),
      }),
      { params: Promise.resolve({ id: '53', itemId: 'uuid-1' }) }
    );

    expect(res.status).toBe(200);

    const call = updateCall();
    expect(call[1]).toBe('mayor');       // modalidad CONSERVADA
    expect(call[2]).toBe(2);             // unidades CONSERVADAS (no null)
    expect(call[3]).toBe(40);            // precio actualizado a 40
  });
});
