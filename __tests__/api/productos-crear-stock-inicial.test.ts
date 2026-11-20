/**
 * @jest-environment node
 *
 * Fase B — B2: el stock con que se crea un producto se registra como ingreso.
 *
 * Contrato aprobado:
 * - saldo > 0 al crear → INSERT productos + INSERT ingresos_mercaderia en la
 *   MISMA transacción (sql.transaction). Si falla cualquiera, no queda nada.
 * - ingreso: cantidad = saldo, cantcaja_registrado = cantcaja,
 *   cantcaja_cambio = false, observaciones = OBS_STOCK_INICIAL,
 *   usuario_id/usuario_nombre de la sesión.
 * - saldo 0 o ausente → sin fila, INSERT simple (comportamiento actual).
 * - sesión sin id entero y saldo > 0 → 400.
 */

const getServerSession = jest.fn();
const sql = jest.fn();
const mockTransaction = jest.fn();

jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));
jest.mock('@/lib/db', () => {
  const s = (...args: any[]) => sql(...args);
  s.transaction = (queries: any[]) => mockTransaction(queries);
  return { sql: s };
});

import { POST } from '../../app/api/productos/route';
import { OBS_STOCK_INICIAL } from '@/lib/historial';

const req = (body: any) => ({ json: () => Promise.resolve(body) }) as any;
const BASE = { codigo: 'SI-1', detalle: 'Producto con stock', costo: 10, prcventa: 30 };

/** Queries [strings, ...valores] que recibió la transacción. */
const txQueries = () => (mockTransaction.mock.calls[0]?.[0] ?? []) as any[][];
const texto = (q: any[]) => q[0].join('');
const valores = (q: any[]) => q.slice(1);

const PRODUCTO = { id: 1, codigo: 'SI-1', saldo: 12, cantcaja: 24 };

beforeEach(() => {
  jest.clearAllMocks();
  getServerSession.mockResolvedValue({
    user: { id: '7', nombre: 'Paola', rol: 'admin', empresas: [1] },
  });
  sql.mockReset();
  mockTransaction.mockReset();
  // 1ra llamada: dup check → sin duplicado. El resto (sin transacción) es el
  // INSERT simple, que devuelve una fila.
  sql.mockImplementationOnce(() => []);
  sql.mockImplementation((...args: any[]) => args); // tagged template crudo
  mockTransaction.mockResolvedValue([[PRODUCTO], [{ id: 9 }]]);
});

describe('R1 — saldo > 0: producto e ingreso en una sola transacción', () => {
  it('usa sql.transaction con exactamente 2 statements y sin INSERT suelto', async () => {
    const res = await POST(req({ ...BASE, saldo: 12 }));
    expect(res.status).toBe(201);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const queries = txQueries();
    expect(queries).toHaveLength(2);
    expect(texto(queries[0])).toMatch(/INSERT\s+INTO\s+productos/i);
    expect(texto(queries[1])).toMatch(/INSERT\s+INTO\s+ingresos_mercaderia/i);
  });

  it('devuelve el producto que retorna la transacción', async () => {
    const res = await POST(req({ ...BASE, saldo: 12 }));
    const body = await res.json();
    expect(body.data).toEqual(PRODUCTO);
  });
});

describe('R2/R6 — campos exactos del ingreso', () => {
  it('cantidad=saldo, cantcaja_registrado=cantcaja, cambio=false, observación, usuario', async () => {
    await POST(req({ ...BASE, saldo: 12, cantcaja: 24 }));
    const ingreso = txQueries()[1];
    expect(texto(ingreso)).toMatch(/cantcaja_cambio[\s\S]*false/i);
    expect(valores(ingreso)).toEqual([
      1, 'SI-1', 12, 24, OBS_STOCK_INICIAL, 7, 'Paola',
    ]);
  });

  it('sin cantcaja → cantcaja_registrado = 1', async () => {
    await POST(req({ ...BASE, saldo: 12 }));
    const ingreso = txQueries()[1];
    expect(valores(ingreso)).toEqual([
      1, 'SI-1', 12, 1, OBS_STOCK_INICIAL, 7, 'Paola',
    ]);
  });

  it('id numérico de sesión se conserva y nombre ausente cae a "usuario"', async () => {
    getServerSession.mockResolvedValue({ user: { id: 7, rol: 'admin', empresas: [1] } });
    await POST(req({ ...BASE, saldo: 12 }));
    const v = valores(txQueries()[1]);
    expect(v[5]).toBe(7);
    expect(v[6]).toBe('usuario');
  });
});

describe('R3 — saldo 0 o ausente: sin fila en ingresos_mercaderia', () => {
  it('saldo 0 → INSERT simple, sin transacción', async () => {
    const res = await POST(req({ ...BASE, saldo: 0 }));
    expect(res.status).toBe(201);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(sql).toHaveBeenCalledTimes(2); // dup + INSERT producto
    expect(valores(sql.mock.calls[1]).at(-1)).toBeDefined();
  });

  it('saldo ausente → INSERT simple, sin transacción', async () => {
    const res = await POST(req(BASE));
    expect(res.status).toBe(201);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(sql).toHaveBeenCalledTimes(2);
  });
});

describe('R4 — saldo inválido → 400 sin tocar la base', () => {
  it.each([-1, 2.5, 'abc', true])('saldo %p → 400', async (saldo) => {
    const res = await POST(req({ ...BASE, saldo }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('R5 — sesión sin id entero + saldo > 0 → 400', () => {
  it('id "test-admin" no puede registrar el ingreso', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'test-admin', rol: 'admin', empresas: [1] } });
    const res = await POST(req({ ...BASE, saldo: 12 }));
    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('sin id tampoco registra', async () => {
    getServerSession.mockResolvedValue({ user: { rol: 'admin', empresas: [1] } });
    const res = await POST(req({ ...BASE, saldo: 12 }));
    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('pero sin stock sí puede crear (saldo 0)', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'test-admin', rol: 'admin', empresas: [1] } });
    const res = await POST(req(BASE));
    expect(res.status).toBe(201);
  });
});

describe('R7 — fallo de la transacción no deja producto', () => {
  it('transacción rechazada → 500', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('boom'));
    const res = await POST(req({ ...BASE, saldo: 12 }));
    expect(res.status).toBe(500);
    // los dos INSERT se intentaron juntos: la transacción los revierte
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(txQueries()).toHaveLength(2);
  });
});

describe('R8 — duplicado 409 no inserta ingreso', () => {
  it('código existente con saldo > 0 → 409 sin transacción', async () => {
    sql.mockReset();
    sql.mockImplementationOnce(() => [{ id: 99 }]);
    const res = await POST(req({ ...BASE, saldo: 12 }));
    expect(res.status).toBe(409);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('R9 — observación exacta compartida con el historial', () => {
  it('OBS_STOCK_INICIAL es el texto aprobado', () => {
    expect(OBS_STOCK_INICIAL).toBe('Stock inicial al crear el producto');
  });
});
