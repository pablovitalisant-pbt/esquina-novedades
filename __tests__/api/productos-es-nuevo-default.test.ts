/**
 * @jest-environment node
 *
 * Fase B — slice portada-auto: es_nuevo (Destacar) por defecto false en POST.
 */

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));
jest.mock('@/lib/db', () => ({ sql: (...args: any[]) => sql(...args) }));

import { POST } from '../../app/api/productos/route';

const pagina = (body: any) => ({ json: () => Promise.resolve(body) }) as any;
const BASE = { codigo: 'ESN-1', detalle: 'Test destacar', costo: 10, prcventa: 30 };

function valoresInsert() {
  // tagged template: [strings, ...valores]
  return sql.mock.calls[1].slice(1);
}

describe('POST /api/productos — es_nuevo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { rol: 'admin', empresas: [1] } });
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 1 }]);
  });

  test('sin es_nuevo en el body inserta false', async () => {
    const res = await POST(pagina(BASE));
    expect(res.status).toBe(201);
    expect(valoresInsert()).toContain(false);
    expect(valoresInsert()).not.toContain(true);
  });

  test('es_nuevo=true en el body se respeta', async () => {
    const res = await POST(pagina({ ...BASE, es_nuevo: true }));
    expect(res.status).toBe(201);
    expect(valoresInsert()).toContain(true);
  });

  test('es_nuevo=false en el body se respeta', async () => {
    const res = await POST(pagina({ ...BASE, es_nuevo: false }));
    expect(res.status).toBe(201);
    expect(valoresInsert()).toContain(false);
  });
});
