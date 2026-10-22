/**
 * @jest-environment node
 */
/**
 * Fase B — PUT /api/productos/[id]: propagacion S4 (transaccional).
 * Verifica que editar detalle/imagen_url/prcventa propaga atomicamente
 * a ubicaciones_bodega y prenota_items via sql.transaction().
 */
import { NextRequest } from 'next/server';

const getServerSession = jest.fn();
const sql = jest.fn();
const sqlQuery = jest.fn();
const sqlTransaction = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => {
  const fn = (...args: any[]) => sql(...args);
  fn.query = (...args: any[]) => sqlQuery(...args);
  fn.transaction = (...args: any[]) => sqlTransaction(...args);
  return { sql: fn };
});

describe('PUT /api/productos/[id] — propagacion S4', () => {
  let PUT: (req: Request, ctx: { params: { id: string } }) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/productos/[id]/route');
    PUT = mod.PUT;
  });

  beforeEach(() => {
    getServerSession.mockClear();
    sql.mockClear();
    sqlQuery.mockClear();
    sqlTransaction.mockClear();
    sqlQuery.mockReturnValue({ queryData: {} });
  });

  const makeReq = (body: unknown) =>
    new NextRequest('http://localhost/api/productos/1', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });

  const ctx = { params: { id: '1' } };

  const authAdmin = () => {
    getServerSession.mockResolvedValue({
      user: { rol: 'admin', empresas: [2] },
    });
  };

  test('1 — editar detalle: propaga a ubicaciones_bodega y prenota_items', async () => {
    authAdmin();
    sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]); // access check
    sqlTransaction.mockResolvedValueOnce([
      [{ id: 1, detalle: 'Nuevo detalle' }], // producto UPDATE result
      [],                                      // ubicaciones UPDATE result
      [],                                      // prenota_items UPDATE result
    ]);

    const res = await PUT(makeReq({ detalle: 'Nuevo detalle' }), ctx);
    expect(res.status).toBe(200);

    // sqlQuery debe haberse llamado 2 veces: UPDATE + prenota query
    expect(sqlQuery).toHaveBeenCalledTimes(2);
    // sqlTransaction debe haberse llamado 1 vez
    expect(sqlTransaction).toHaveBeenCalledTimes(1);

    // Verificar que la query de prenota_items se construyo
    const prenotaCall = sqlQuery.mock.calls[1];
    expect(prenotaCall[0].toLowerCase()).toContain('prenota_items');
    // Verificar que la query de ubicaciones se construyo via tagged template
    const sqlCalls = sql.mock.calls.map((c: any) => String(Array.isArray(c[0]) ? c[0].join('') : c[0]));
    expect(sqlCalls.some((s: string) => s.toLowerCase().includes('ubicaciones_bodega'))).toBe(true);
  });

  test('2 — editar prcventa: propaga solo a prenota_items', async () => {
    authAdmin();
    sql
      .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]) // access check
      .mockResolvedValueOnce([{ costo: null, margen_pct: null }]); // anti-drift
    sqlTransaction.mockResolvedValueOnce([
      [{ id: 1, prcventa: 25 }], // producto UPDATE result
      [],                          // prenota_items UPDATE result
    ]);

    const res = await PUT(makeReq({ prcventa: 25 }), ctx);
    expect(res.status).toBe(200);

    expect(sql).toHaveBeenCalledTimes(2); // access + anti-drift
    expect(sqlQuery).toHaveBeenCalledTimes(2); // UPDATE + prenota query
    expect(sqlTransaction).toHaveBeenCalledTimes(1);
  });

  test('3 — editar categoria: NO propaga nada', async () => {
    authAdmin();
    sql
      .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]) // access check
      .mockResolvedValueOnce([{ nombre: 'Medicina' }]); // validacion categoria
    sqlTransaction.mockResolvedValueOnce([[{ id: 1, categoria: 'Medicina' }]]); // solo UPDATE

    const res = await PUT(makeReq({ categoria: 'Medicina' }), ctx);
    expect(res.status).toBe(200);

    expect(sql).toHaveBeenCalledTimes(2);
    expect(sqlQuery).toHaveBeenCalledTimes(1); // solo UPDATE query
    expect(sqlTransaction).toHaveBeenCalledTimes(1);
  });

  test('4 — editar costo: NO propaga (anti-drift calcula prcventa)', async () => {
    authAdmin();
    sql
      .mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]) // access check
      .mockResolvedValueOnce([{ costo: 8, margen_pct: 25 }]); // anti-drift
    sqlTransaction.mockResolvedValueOnce([[{ id: 1, costo: 10, margen_pct: 25, prcventa: 12.50 }]]);

    const res = await PUT(makeReq({ costo: 10 }), ctx);
    expect(res.status).toBe(200);

    expect(sql).toHaveBeenCalledTimes(2);
    expect(sqlQuery).toHaveBeenCalledTimes(1); // solo UPDATE
    expect(sqlTransaction).toHaveBeenCalledTimes(1);
  });

  test('5 — prenota_items query incluye NOT EXISTS contra caja_movimiento_notas', async () => {
    authAdmin();
    sql.mockResolvedValueOnce([{ empresa_id: 2, codigo: 'PROD-01' }]); // access check
    sqlTransaction.mockResolvedValueOnce([
      [{ id: 1, detalle: 'Test' }], // producto UPDATE result
      [],                             // ubicaciones UPDATE result
      [],                             // prenota_items UPDATE result
    ]);

    const res = await PUT(makeReq({ detalle: 'Test' }), ctx);
    expect(res.status).toBe(200);

    // la query de prenota_items debe incluir NOT EXISTS
    const prenotaQuery = sqlQuery.mock.calls[1][0] as string;
    expect(prenotaQuery.toLowerCase()).toContain('not exists');
    expect(prenotaQuery.toLowerCase()).toContain('caja_movimiento_notas');
    expect(prenotaQuery.toLowerCase()).toContain("estado = 'activa'");
  });
});
