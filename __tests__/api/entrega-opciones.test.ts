/**
 * @jest-environment node
 *
 * Fase B — 7a: opciones de entrega (GET público, PATCH admin, migración 042).
 */
import fs from 'fs';
import path from 'path';
const getServerSession = jest.fn();
const sql = jest.fn();
jest.mock('next-auth', () => ({ getServerSession: (...a: any[]) => getServerSession(...a) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/db', () => ({ sql: (...a: any[]) => sql(...a) }));
import { GET } from '@/app/api/entrega/opciones/route';
import { PATCH } from '@/app/api/entrega/opciones/[codigo]/route';
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '../..', p), 'utf8');
const admin = { user: { id: '7', rol: 'admin' } };
const opcion = { codigo: 'retiro', nombre: 'Retiro en tienda', costo: 0, requiere_direccion: false, activa: true, orden: 1, nota: null };
const patch = (codigo: string, body: unknown) => PATCH(
  new Request(`http://localhost/api/entrega/opciones/${codigo}`, { method: 'PATCH', body: typeof body === 'string' ? body : JSON.stringify(body) }),
  { params: Promise.resolve({ codigo }) },
);
beforeEach(() => { jest.resetAllMocks(); getServerSession.mockResolvedValue(admin); sql.mockResolvedValue([]); });

test('GET público: 200 sin sesión, solo activas y ordenadas por orden', async () => {
  sql.mockResolvedValueOnce([opcion]);
  const res = await GET();
  expect(res.status).toBe(200);
  expect((await res.json()).data).toEqual([opcion]);
  expect(getServerSession).not.toHaveBeenCalled();
  const t = sql.mock.calls[0][0].join('');
  expect(t).toMatch(/WHERE\s+activa\s*=\s*true/);
  expect(t).toMatch(/ORDER BY\s+orden/);
});
test('GET con DB caída => 500', async () => {
  sql.mockRejectedValueOnce(new Error('boom'));
  expect((await GET()).status).toBe(500);
});
test('PATCH 401 sin sesión, 403 no admin, 404 código inexistente', async () => {
  getServerSession.mockResolvedValueOnce(null);
  expect((await patch('retiro', { costo: 1 })).status).toBe(401);
  getServerSession.mockResolvedValueOnce({ user: { id: '2', rol: 'vendedor' } });
  expect((await patch('retiro', { costo: 1 })).status).toBe(403);
  expect(sql).not.toHaveBeenCalled();
  expect((await patch('no_existe', { costo: 1 })).status).toBe(404);
});
test.each([
  ['vacío', {}], ['JSON inválido', '{no'],
  ['costo negativo', { costo: -1 }], ['costo decimal', { costo: 1.5 }],
  ['costo string', { costo: '3000' }], ['costo null', { costo: null }],
  ['activa no booleana', { activa: 'si' }], ['orden decimal', { orden: 1.2 }],
  ['requiere_direccion no booleana', { requiere_direccion: 1 }],
  ['nota no string', { nota: 123 }], ['campo desconocido', { nombre: 'x' }],
])('PATCH %s => 400 sin escribir', async (_n, body) => {
  expect((await patch('retiro', body)).status).toBe(400);
  expect(sql).not.toHaveBeenCalled();
});
test('PATCH parcial conserva lo no enviado y nota null la limpia', async () => {
  sql.mockResolvedValueOnce([opcion]).mockResolvedValueOnce([{ ...opcion, costo: 3000 }]);
  const res = await patch('retiro', { costo: 3000 });
  expect(res.status).toBe(200);
  expect((await res.json()).data.costo).toBe(3000);
  const update = sql.mock.calls[1];
  expect(update[0].join('')).toMatch(/UPDATE\s+opciones_entrega/);
  expect(update.slice(1)).toEqual(expect.arrayContaining([3000, false, true])); // costo, requiere, activa
  sql.mockResolvedValueOnce([{ ...opcion, nota: 'texto' }]).mockResolvedValueOnce([{ ...opcion, activa: false }]);
  expect((await patch('retiro', { activa: false, nota: null })).status).toBe(200);
  expect(sql.mock.calls[3].slice(1)).toContain(false);
});
test('migración 042: tabla+seed idempotente y columnas de checkout', () => {
  const s = read('migrations/042_opciones_entrega_checkout.sql');
  expect(s).toMatch(/CREATE TABLE IF NOT EXISTS public\.opciones_entrega/);
  expect(s).toMatch(/CHECK \(costo >= 0\)/);
  expect(s.match(/^ {2}\('(retiro|delivery_iquique|delivery_alto_hospicio|envio_arica)'/gm)).toHaveLength(4);
  expect(s).toMatch(/ON CONFLICT \(codigo\) DO NOTHING/);
  for (const col of ['email_contacto', 'entrega_codigo', 'entrega_costo', 'direccion_entrega', 'total'])
    expect(s).toMatch(new RegExp(`ALTER TABLE public\\.pedidos ADD COLUMN IF NOT EXISTS ${col}`));
  expect(s).toMatch(/entrega_codigo TEXT REFERENCES public\.opciones_entrega\(codigo\)/);
  expect(s).toMatch(/ALTER TABLE public\.pedido_items ADD COLUMN IF NOT EXISTS modalidad/);
  expect(s).toMatch(/GENERATED ALWAYS AS \(cantidad \* precio\) STORED/);
  expect(s).toMatch(/ALTER TABLE public\.clientes ADD COLUMN IF NOT EXISTS email TEXT/);
  expect(read('scripts/migrations-order.ts')).toMatch(/042_opciones_entrega_checkout\.sql',\s*'043_pedidos_reserva\.sql',/);
  expect(s.indexOf('CREATE TABLE IF NOT EXISTS public.opciones_entrega'))
    .toBeLessThan(s.indexOf('REFERENCES public.opciones_entrega'));
});
