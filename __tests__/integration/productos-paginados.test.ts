/** @jest-environment node */

/**
 * N09a Fase B — GET /api/productos paginado contra Postgres TEST real.
 * Con flag `precios-paginados` y paginado=true recorre por cursor de código
 * sin duplicados ni saltos; filtros antes del corte. Sin opt-in o flag off
 * conserva { data } y el límite legado.
 */
import { NextRequest } from 'next/server';

const getServerSession = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
jest.mock('@/config/feature-flags.json', () =>
  require('@/__tests__/helpers/mockFlags').mockFlags({ 'precios-paginados': true }));

import { GET } from '@/app/api/productos/route';
import { sql } from '@/lib/db';

const flags = jest.requireMock('@/config/feature-flags.json') as Record<string, boolean>;
const PREFIJO = `N09A-${Date.now()}`;

type Fila = { codigo: string; saldo: number; es_nuevo: boolean; detalle: string };

const get = async (params: Record<string, string> = {}) => {
  const qs = new URLSearchParams({ search: PREFIJO, ...params });
  const res = await GET(new NextRequest(`http://localhost/api/productos?${qs}`));
  return (await res.json()) as { data: Fila[]; siguienteCursor?: string | null };
};

beforeAll(async () => {
  getServerSession.mockResolvedValue({ user: { id: '1', rol: 'admin', empresas: [1] } });
  await sql`INSERT INTO productos (empresa_id, codigo, detalle, prcventa, costo, saldo, activo, es_nuevo)
    SELECT 1, ${PREFIJO} || lpad(i::text, 3, '0'), ${PREFIJO}, 1000, 500,
      CASE WHEN i % 10 = 0 THEN 0 ELSE 10 END, true, i <= 5
    FROM generate_series(1, 55) AS i`;
});

afterAll(async () => {
  await sql`DELETE FROM productos WHERE codigo LIKE ${PREFIJO + '%'}`;
});
test('dos páginas de 50 y 5, ordenadas y sin duplicados', async () => {
  const p1 = await get({ paginado: 'true' });
  expect(p1.data).toHaveLength(50);
  expect(p1.siguienteCursor).toBeTruthy();

  const p2 = await get({ paginado: 'true', cursor: p1.siguienteCursor! });
  expect(p2.data).toHaveLength(5);
  expect(p2.siguienteCursor ?? null).toBeNull();

  const codigos = [...p1.data, ...p2.data].map((p) => p.codigo);
  expect(new Set(codigos).size).toBe(55);
  expect(codigos).toEqual([...codigos].sort());
  expect(codigos[0]).toBe(`${PREFIJO}001`);
  expect(codigos[54]).toBe(`${PREFIJO}055`);
});
test('soloStock descarta sin stock y no inventa una página extra', async () => {
  const res = await get({ paginado: 'true', soloStock: 'true' });
  expect(res.data).toHaveLength(50);
  expect(res.data.every((p) => Number(p.saldo) > 0)).toBe(true);
  expect(res.siguienteCursor ?? null).toBeNull();
});
test('soloNuevo se aplica antes del corte de página', async () => {
  const res = await get({ paginado: 'true', soloNuevo: 'true' });
  expect(res.data).toHaveLength(5);
  expect(res.data.every((p) => p.es_nuevo === true)).toBe(true);
  expect(res.siguienteCursor ?? null).toBeNull();
});
test('la búsqueda se combina con el paginado', async () => {
  const res = await get({ paginado: 'true', search: `${PREFIJO}03` });
  expect(res.data).toHaveLength(10);
  expect(res.data.every((p) => p.codigo.includes(`${PREFIJO}03`))).toBe(true);
});
test('sin paginado=true conserva { data } y el límite legado', async () => {
  const res = await get();
  expect(Object.keys(res)).toEqual(['data']);
  expect(res.data).toHaveLength(55);
});
test('flag apagado ignora paginado=true y no agrega metadata', async () => {
  flags['precios-paginados'] = false;
  try {
    const res = await get({ paginado: 'true' });
    expect(res.siguienteCursor).toBeUndefined();
    expect(res.data).toHaveLength(55);
  } finally {
    flags['precios-paginados'] = true;
  }
});
