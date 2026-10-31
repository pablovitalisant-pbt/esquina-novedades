/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BodegaClient } from './client_page';

let toastMock: any;

jest.mock('next/image', () => ({ ...props }: any) =>
  require('react').createElement('img', { ...props, alt: '' })
);
jest.mock('sonner', () => ({
  toast: {
    success: (...a: any[]) => toastMock.success(...a),
    error: (...a: any[]) => toastMock.error(...a),
  },
}));
jest.mock('@/hooks/useShareImage', () => ({
  useShareImage: () => ({ shareImage: jest.fn() }),
}));
jest.mock('@/components/ui/sheet', () => {
  const React = require('react');
  return {
    Sheet: ({ children }: any) => <div>{children}</div>,
    SheetContent: ({ children }: any) => <div>{children}</div>,
    SheetHeader: ({ children }: any) => <div>{children}</div>,
    SheetTitle: ({ children }: any) => <div>{children}</div>,
    SheetDescription: ({ children }: any) => <div>{children}</div>,
  };
});

const fetchMock = jest.fn();
global.fetch = fetchMock as any;

beforeEach(() => {
  jest.clearAllMocks();
  toastMock = { success: jest.fn(), error: jest.fn() };
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
  // jsdom arranca online por defecto; asegurarse por si un test anterior lo cambió.
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

const UBI = {
  codigo: 'P001',
  detalle: 'Producto prueba',
  producto_imagen_url: null,
  empresa_id: 1,
  saldo: 20,
  cantcaja: 10,
  umed: 'u',
  fisico: null,
  fisico_cajas: null,
  fisico_unidades: null,
  diferencia: null,
  ubicacion: 'A1',
  observaciones: null,
};

async function typeSearch(term: string) {
  render(<BodegaClient session={{ user: { id: '1', rol: 'bodeguero' } }} />);
  const input = await screen.findByPlaceholderText('Buscar ubicación o código...');
  fireEvent.change(input, { target: { value: term } });
}

// Abre el drawer con una sesión dada y un producto cargado.
async function openDrawerAs(session: any) {
  fetchMock.mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('/api/ubicaciones?')) {
      return { ok: true, json: async () => ({ data: [UBI] }) } as Response;
    }
    if (url.startsWith('/api/bodega/conciliaciones') && init?.method === 'POST') {
      return { ok: true, json: async () => ({ data: { codigo: UBI.codigo, saldo_anterior: 20, saldo_nuevo: 32, diferencia: 12 } }) } as Response;
    }
    throw new Error(`Unhandled fetch: ${url}`);
  });

  render(<BodegaClient session={session} />);
  const input = await screen.findByPlaceholderText('Buscar ubicación o código...');
  fireEvent.change(input, { target: { value: 'P0' } });
  await screen.findAllByText('P001');
  fireEvent.click(screen.getAllByText('P001')[0]); // abre el drawer
}

describe('app/(app)/bodega — carga y guardado por API', () => {
  it('busca con fetch a /api/ubicaciones', async () => {
    await typeSearch('GL81203');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/ubicaciones');
  });

  it('guardar usa el fetch PUT a /api/ubicaciones/codigo', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith('/api/ubicaciones?')) {
        return { ok: true, json: async () => ({ data: [UBI] }) } as Response;
      }
      if (url.includes('/codigo/') && init?.method === 'PUT') {
        return { ok: true, json: async () => ({ data: UBI }) } as Response;
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });

    await typeSearch('P0');
    await screen.findAllByText('P001');
    fireEvent.click(screen.getAllByText('P001')[0]);
    fireEvent.click(screen.getByText('Guardar ubicación'));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'PUT');
      expect(put).toBeDefined();
    });
  });
});

describe('app/(app)/bodega — botón "Actualizar Stock" ', () => {
  it('admin → botón visible', async () => {
    await openDrawerAs({ user: { id: '1', nombre: 'Pablo', rol: 'admin' } });
    expect(screen.getByRole('button', { name: /actualizar stock/i })).toBeInTheDocument();
  });

  it('vendedor → botón NO aparece (no solo deshabilitado)', async () => {
    await openDrawerAs({ user: { id: '2', nombre: 'V', rol: 'vendedor' } });
    expect(screen.queryByRole('button', { name: /actualizar stock/i })).not.toBeInTheDocument();
  });

  it('bodeguero → botón NO aparece', async () => {
    await openDrawerAs({ user: { id: '3', nombre: 'B', rol: 'bodeguero' } });
    expect(screen.queryByRole('button', { name: /actualizar stock/i })).not.toBeInTheDocument();
  });

  it('admin + offline → botón deshabilitado + mensaje de sin conexión', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await openDrawerAs({ user: { id: '1', nombre: 'Pablo', rol: 'admin' } });
    // setear conteo para que el único motivo de disabled sea el offline
    const spinbuttons = await screen.findAllByRole('spinbutton');
    fireEvent.change(spinbuttons[0], { target: { value: '3' } });
    const btn = screen.getByRole('button', { name: /actualizar stock/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });

  it('confirm + admin → POST /api/bodega/conciliaciones + toast + refresco de saldo', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    await openDrawerAs({ user: { id: '1', nombre: 'Pablo', rol: 'admin' } });

    const spinbuttons = await screen.findAllByRole('spinbutton');
    fireEvent.change(spinbuttons[0], { target: { value: '3' } }); // cajas
    fireEvent.change(spinbuttons[1], { target: { value: '2' } }); // sueltas

    fireEvent.click(screen.getByRole('button', { name: /actualizar stock/i }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c: any[]) => c[0] === '/api/bodega/conciliaciones' && c[1]?.method === 'POST');
      expect(post).toBeDefined();
    });
    const postCall = fetchMock.mock.calls.find((c: any[]) => c[0] === '/api/bodega/conciliaciones' && c[1]?.method === 'POST');
    const body = JSON.parse(postCall![1].body);
    expect(body).toEqual(expect.objectContaining({ codigo: 'P001', fisico_cajas: 3, fisico_unidades: 2 }));

    // toast con resultado y refresco del saldo en "Sistema"
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Stock actualizado: 20 → 32 unidades'));
    expect(screen.getByText(/32 unidades · 10 u\/caja/)).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('confirm rechazada → NO hace el POST', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    await openDrawerAs({ user: { id: '1', nombre: 'Pablo', rol: 'admin' } });
    const spinbuttons = await screen.findAllByRole('spinbutton');
    fireEvent.change(spinbuttons[0], { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /actualizar stock/i }));
    // dar margen para que un fetch incorrecto tuviera oportunidad de correrse
    await new Promise(r => setTimeout(r, 50));
    const post = fetchMock.mock.calls.find((c: any[]) => c[0] === '/api/bodega/conciliaciones');
    expect(post).toBeUndefined();
    confirmSpy.mockRestore();
  });
});
