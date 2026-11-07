/**
 * @jest-environment node
 */

// Fase B — N13 page server: initialData, redirect antes del helper, fallback sin romper la shell.
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => { throw new Error('NEXT_REDIRECT'); }),
}));
jest.mock('@/lib/notas-venta/detalle', () => ({ leerDetalleNota: jest.fn() }));
jest.mock('@/app/(app)/notas-venta/[id]/client_page', () => ({
  PrenotaDetallePage: (props: unknown) => ({ type: 'PrenotaDetallePage', props }),
}));

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { leerDetalleNota } from '@/lib/notas-venta/detalle';
import { PrenotaDetallePage } from '@/app/(app)/notas-venta/[id]/client_page';
import Page from '@/app/(app)/notas-venta/[id]/page';

const mockSession = getServerSession as jest.Mock;
const mockRedirect = jest.mocked(redirect);
const mockLeer = leerDetalleNota as jest.Mock;
const params = { params: Promise.resolve({ id: '1' }) };
const nota = { id: '1', cliente_nombre: 'Ana', items: [] };

describe('PrenotaDetalleRoute (N13)', () => {
  beforeEach(() => jest.clearAllMocks());

  test.each(['admin', 'vendedor'])('%s: devuelve PrenotaDetallePage con initialData', async (rol) => {
    mockSession.mockResolvedValue({ user: { rol } });
    mockLeer.mockResolvedValue(nota);

    const el = (await Page(params)) as any;

    expect(el.type).toBe(PrenotaDetallePage);
    expect(el.key).toBe('1');
    expect(el.props.initialData).toEqual({ id: '1', nota });
  });

  test.each([null, { user: { rol: 'bodeguero' } }])('sin permiso: redirect antes del helper', async (session) => {
    mockSession.mockResolvedValue(session);

    await expect(Page(params)).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalled();
    expect(mockLeer).not.toHaveBeenCalled();
  });

  test('sin params (caller histórico): renderiza el cliente sin initialData', async () => {
    mockSession.mockResolvedValue({ user: { rol: 'admin' } });

    const el = (await Page({})) as any;

    expect(el.props.initialData).toBeUndefined();
    expect(mockLeer).not.toHaveBeenCalled();
  });

  test.each(['abc', '0', '-1'])('id inválido (%s): sin initialData y sin helper', async (id) => {
    mockSession.mockResolvedValue({ user: { rol: 'admin' } });

    const el = (await Page({ params: Promise.resolve({ id }) })) as any;

    expect(el.props.initialData).toBeUndefined();
    expect(mockLeer).not.toHaveBeenCalled();
  });

  test('nota ausente: renderiza el cliente sin initialData (maneja 404 por API)', async () => {
    mockSession.mockResolvedValue({ user: { rol: 'admin' } });
    mockLeer.mockResolvedValue(null);

    const el = (await Page(params)) as any;

    expect(el.type).toBe(PrenotaDetallePage);
    expect(el.props.initialData).toBeUndefined();
  });

  test('error de lectura DB: cae al fetch del cliente', async () => {
    mockSession.mockResolvedValue({ user: { rol: 'admin' } });
    mockLeer.mockRejectedValue(new Error('DB down'));

    const el = (await Page(params)) as any;

    expect(el.type).toBe(PrenotaDetallePage);
    expect(el.props.initialData).toBeUndefined();
  });

  test('redirect no se captura por el try de lectura', async () => {
    mockSession.mockResolvedValue(null);

    await expect(Page(params)).rejects.toThrow('NEXT_REDIRECT');
  });
});
