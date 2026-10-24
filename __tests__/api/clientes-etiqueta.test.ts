/**
 * @jest-environment node
 *
 * Fase B — Slice 6a: etiqueta de cliente derivada (mayorista/minorista/ambos/sin).
 */
import { NextRequest } from 'next/server';
const getServerSession = jest.fn();
const sql = jest.fn();
jest.mock('next-auth', () => ({ getServerSession: (...a: any[]) => getServerSession(...a) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/db', () => ({ sql: (...a: any[]) => sql(...a) }));
import { GET } from '@/app/api/clientes/route';
const sesionAdmin = { user: { id: '7', rol: 'admin' } };
const captura = (i = 0) => {
  const [strings, ...values] = sql.mock.calls[i];
  return { texto: strings.join(''), values };
};
beforeEach(() => {
  jest.resetAllMocks();
  getServerSession.mockResolvedValue(sesionAdmin);
  sql.mockResolvedValue([]);
});
describe('GET /api/clientes — etiqueta derivada', () => {
  test('calcula la etiqueta desde prenota_items de notas activas', async () => {
    await GET(new NextRequest('http://localhost/api/clientes'));
    const { texto, values } = captura();
    expect(texto).toMatch(/BOOL_AND\(pi\.modalidad\s*=\s*'caja'\)/);
    expect(texto).toMatch(/BOOL_AND\(pi\.modalidad\s*=\s*'unidad'\)/);
    expect(texto).toMatch(/COUNT\(\*\)\s*=\s*0/);
    expect(texto).toMatch(/estado\s*=\s*'activa'/);
    expect(texto).toMatch(/AS etiqueta/);
    expect(values).toContain(null); // sin filtro
  });
  // A12: la línea Despacho no es un producto y no debe volver 'ambos' a un
  // cliente que solo compró por caja.
  test('A12 — la etiqueta excluye la línea DESPACHO', async () => {
    await GET(new NextRequest('http://localhost/api/clientes'));
    const { texto, values } = captura();
    expect(texto).toMatch(/codigo\s*(<>|NOT IN)/i);
    expect(texto + values.join(',')).toMatch(/DESPACHO/);
  });

  test('una sola query con LIMIT 50 (q y etiqueta combinados)', async () => {
    await GET(new NextRequest('http://localhost/api/clientes'));
    await GET(new NextRequest('http://localhost/api/clientes?q=Ana&etiqueta=ambos'));
    expect(sql).toHaveBeenCalledTimes(2);
    for (const call of sql.mock.calls) expect(call[0].join('')).toMatch(/LIMIT 50/);
    const { texto, values } = captura(1);
    expect(texto).toMatch(/ILIKE/);
    expect(values).toContain('%Ana%');
    expect(values).toContain('ambos');
  });
  test('etiqueta valida se filtra ANTES del LIMIT; sin => IS NULL', async () => {
    await GET(new NextRequest('http://localhost/api/clientes?etiqueta=mayorista'));
    const { texto, values } = captura();
    expect(values).toContain('mayorista');
    const filtro = texto.search(/c\.etiqueta\s*=\s*\$\d+|etiqueta\s*IS NULL/);
    expect(filtro).toBeGreaterThan(-1);
    expect(filtro).toBeLessThan(texto.indexOf('LIMIT 50'));
    await GET(new NextRequest('http://localhost/api/clientes?etiqueta=sin'));
    const sin = captura(1);
    expect(sin.texto).toMatch(/IS NULL/);
    expect(sin.values).toContain('sin');
  });
  test('whitelist completa => 200', async () => {
    for (const e of ['mayorista', 'minorista', 'ambos', 'sin']) {
      sql.mockClear();
      const res = await GET(new NextRequest(`http://localhost/api/clientes?etiqueta=${e}`));
      expect(res.status).toBe(200);
      expect(sql).toHaveBeenCalledTimes(1);
    }
  });
  test.each(['xxx', "'; DROP TABLE clientes; --"])('invalida %p => 400 sin DB', async (e) => {
    const res = await GET(new NextRequest(`http://localhost/api/clientes?etiqueta=${encodeURIComponent(e)}`));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });
  test('devuelve etiqueta y saldo_favor numerico; null se conserva', async () => {
    sql.mockResolvedValueOnce([{ id: 'c1', nombre: 'Juana', saldo_favor: '40', etiqueta: 'mayorista' }]);
    const res = await GET(new NextRequest('http://localhost/api/clientes?etiqueta=mayorista'));
    const { data } = await res.json();
    expect(data[0]).toEqual(expect.objectContaining({ etiqueta: 'mayorista', saldo_favor: 40 }));
    sql.mockResolvedValueOnce([{ id: 'c2', nombre: 'Pedro', saldo_favor: '0', etiqueta: null }]);
    const { data: sin } = await (await GET(new NextRequest('http://localhost/api/clientes'))).json();
    expect(sin[0].etiqueta).toBeNull();
  });
});
