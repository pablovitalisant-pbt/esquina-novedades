/**
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');

it('la lista agrega el CASE con BOOL_AND como tipo', () => {
  const src = fs.readFileSync(path.join(root, 'app/api/notas-venta/route.ts'), 'utf-8');
  expect(src).toMatch(/BOOL_AND\(pi\.modalidad\s*=\s*'caja'\)/);
  expect(src).toMatch(/BOOL_AND\(pi\.modalidad\s*=\s*'unidad'\)/);
  expect(src).toMatch(/as tipo/i);
});

jest.mock('next-auth', () => ({
  getServerSession: () => Promise.resolve({ user: { id: 1, rol: 'admin' } }),
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));

let items: any[] = [];
const mockSql: any = jest.fn((strings: any) => {
  const q = strings.join(' ');
  if (q.includes('FROM public.prenotas p')) return Promise.resolve([{ id: 5, cliente_id: null, titulo: 'Nota', estado: 'activa' }]);
  if (q.includes('FROM public.prenota_items')) return Promise.resolve(items);
  return Promise.resolve([{ total: '0' }]);
});
jest.mock('@/lib/db', () => ({ sql: (...a: any[]) => mockSql(...a) }));

async function getTipo(rows: any[]) {
  items = rows;
  const { GET } = await import('@/app/api/notas-venta/[id]/route');
  const res = await GET({} as any, { params: { id: '5' } } as any);
  return (await res.json()).tipo;
}

it('sin items -> null; solo cajas -> mayor; solo unidades -> menor; mixta -> mixta', async () => {
  expect(await getTipo([])).toBeNull();
  expect(await getTipo([{ modalidad: 'caja' }, { modalidad: 'caja' }])).toBe('mayor');
  expect(await getTipo([{ modalidad: 'unidad' }, { modalidad: 'unidad' }])).toBe('menor');
  expect(await getTipo([{ modalidad: 'caja' }, { modalidad: 'unidad' }])).toBe('mixta');
});
