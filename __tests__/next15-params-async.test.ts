/**
 * Slice U1.1 — params asíncronos (Next 15): los 5 puntos del inventario
 * aceptan params como Promise y como objeto plano (retrocompat en 14).
 *
 * @jest-environment node
 */
const mockSql = jest.fn();
const mockSession = jest.fn();

jest.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); },
}));
jest.mock('next-auth', () => ({ getServerSession: (...a: any[]) => mockSession(...a) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/db', () => ({ sql: (...a: any[]) => mockSql(...a) }));
jest.mock('@/lib/pedidos/liberar-reservas', () => ({ liberarReservasVencidas: jest.fn() }));
jest.mock('@/app/(app)/notas-venta/[id]/client_page', () => ({ PrenotaDetallePage: () => null }));
jest.mock('@/app/catalogo/[slug]/client_page', () => ({ PublicCatalogoClient: () => null }));
jest.mock('next/server', () => ({
  NextResponse: { json: (b: any, i?: any) => ({ status: i?.status ?? 200, json: async () => b }) },
}));

import PrenotaDetalleRoute from '@/app/(app)/notas-venta/[id]/page';
import PublicCatalogoPage, { generateMetadata } from '@/app/catalogo/[slug]/page';
import PedidoPage from '@/app/pedido/[id]/page';
import { DELETE } from '@/app/api/admin/usuarios/[id]/route';

const UUID = '6c1f0a2e-8b3d-4a5f-9c7e-1d2b3a4c5d6e';
const variantes = (v: any): [string, any][] => [['promise', Promise.resolve(v)], ['sync', v]];

beforeEach(() => {
  mockSql.mockReset().mockResolvedValue([]);
  mockSession.mockReset();
});

describe.each(variantes({ id: '5' }))('notas-venta page (%s)', (_n, params) => {
  test('pasa session al cliente sin lanzar y sin params Promise', async () => {
    mockSession.mockResolvedValue({ user: { rol: 'admin' } });
    const el: any = await PrenotaDetalleRoute({ params });
    expect(el.props.session).toBeDefined();
    expect(typeof el.props.params?.then).not.toBe('function');
  });
});

describe.each(variantes({ slug: 'mi-slug' }))('catalogo page (%s)', (_n, params) => {
  test('generateMetadata lee el slug', async () => {
    await generateMetadata({ params });
    expect(JSON.stringify(mockSql.mock.calls)).toContain('mi-slug');
  });
  test('page lee el slug (404 si no existe)', async () => {
    await expect(PublicCatalogoPage({ params })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(JSON.stringify(mockSql.mock.calls)).toContain('mi-slug');
  });
});

describe.each(variantes({ id: UUID }))('pedido page (%s)', (_n, params) => {
  test('lee el id (uuid válido llega a la consulta)', async () => {
    await expect(PedidoPage({ params })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(JSON.stringify(mockSql.mock.calls)).toContain(UUID);
  });
});

describe('DELETE usuarios/[id] con params Promise', () => {
  test('sin sesión -> 401', async () => {
    mockSession.mockResolvedValue(null);
    const res: any = await DELETE(new Request('http://x'), { params: Promise.resolve({ id: '2' }) });
    expect(res.status).toBe(401);
  });
  test('admin -> 200', async () => {
    mockSession.mockResolvedValue({ user: { rol: 'admin', id: 1 } });
    const res: any = await DELETE(new Request('http://x'), { params: Promise.resolve({ id: '2' }) });
    expect(res.status).toBe(200);
  });
});
