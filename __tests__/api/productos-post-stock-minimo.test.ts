/**
 * @jest-environment node
 *
 * Fase B — stock_minimo en POST /api/productos.
 * R3/R4: validacion de stock_minimo en creacion.
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

import { POST } from '../../app/api/productos/route';

function makePostRequest(body: any) {
  return { json: () => Promise.resolve(body) } as any;
}

const BASE_BODY = { codigo: 'SM-TEST', detalle: 'Test stock_minimo', costo: 10, prcventa: 30 };

describe('T3 — POST /api/productos con stock_minimo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'admin', empresas: [1] } });
  });

  it('stock_minimo negativo → 400', async () => {
    sql.mockResolvedValue([]); // dup check
    const res = await POST(makePostRequest({ ...BASE_BODY, stock_minimo: -5 }));
    expect(res.status).toBe(400);
  });

  it('stock_minimo no numerico (string) → 400', async () => {
    sql.mockResolvedValue([]);
    const res = await POST(makePostRequest({ ...BASE_BODY, stock_minimo: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('stock_minimo omitido → INSERT con stock_minimo=NULL, response stock_minimo es null', async () => {
    // dup check pasa, INSERT devuelve producto sin stock_minimo
    sql
      .mockResolvedValueOnce([])  // dup check
      .mockResolvedValueOnce([{ id: 1, codigo: 'SM-TEST', stock_minimo: null }]); // INSERT
    const res = await POST(makePostRequest(BASE_BODY));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.stock_minimo).toBeNull();
  });

  it('stock_minimo valido → INSERT incluye stock_minimo, response lo refleja', async () => {
    sql
      .mockResolvedValueOnce([])  // dup check
      .mockResolvedValueOnce([{ id: 2, codigo: 'SM-TEST2', stock_minimo: 10 }]); // INSERT
    const res = await POST(makePostRequest({ ...BASE_BODY, stock_minimo: 10 }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.stock_minimo).toBe(10);

    // Verificar que el INSERT incluye stock_minimo en columnas
    const insertCall = sql.mock.calls[1][0].join('');
    expect(insertCall).toMatch(/stock_minimo/i);
  });
});

describe('T4 — POST /api/productos con cantcaja (validación boolean, punto 3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'admin', empresas: [1] } });
  });

  it('cantcaja: true → 400 (boolean no es número; hoy inserta 1 silencioso — REG)', async () => {
    const res = await POST(makePostRequest({ ...BASE_BODY, cantcaja: true }));
    expect(res.status).toBe(400);
  });

  it('cantcaja: false → 400', async () => {
    const res = await POST(makePostRequest({ ...BASE_BODY, cantcaja: false }));
    expect(res.status).toBe(400);
  });

  it('cantcaja: 5 válido → 201 con cantcaja=5 (el fix no rompe valores válidos)', async () => {
    sql
      .mockResolvedValueOnce([])  // dup check
      .mockResolvedValueOnce([{ id: 3, codigo: 'SM-TEST3', cantcaja: 5 }]); // INSERT
    const res = await POST(makePostRequest({ ...BASE_BODY, cantcaja: 5 }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.cantcaja).toBe(5);
  });
});
