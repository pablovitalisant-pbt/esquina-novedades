/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SyncConflictosClient } from './client_page';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('lucide-react', () => new Proxy({}, { get: () => () => null }));

const CONFLICTO = {
  id: 5,
  tabla: 'ubicaciones_bodega',
  operacion: 'PATCH',
  entidad_id: 'A-001',
  payload: { ubicacion: 'B2', fisico_cajas: 3 },
  http_status: 400,
  error_mensaje: 'Producto no encontrado',
  usuario_nombre: 'Bodega',
  estado: 'pendiente',
  created_at: '2026-08-01T12:00:00.000Z',
};

let fetchMock: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  fetchMock = jest.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/sync-conflictos') && (!init || !init.method)) {
      return { ok: true, json: async () => ({ data: [CONFLICTO] }) } as Response;
    }
    if (url.includes('/api/sync-conflictos/') && init?.method === 'PATCH') {
      return { ok: true, json: async () => ({ data: { id: 5, estado: 'resuelto' } }) } as Response;
    }
    return { ok: false, json: async () => ({ error: 'unhandled' }) } as Response;
  });
  global.fetch = fetchMock as any;
  global.confirm = jest.fn(() => true) as any;
});

describe('app/(app)/admin/sync-conflictos', () => {
  it('muestra un conflicto pendiente con sus datos', async () => {
    render(<SyncConflictosClient />);
    await screen.findByText('ubicaciones_bodega');
    expect(screen.getByText('A-001')).toBeInTheDocument();
    expect(screen.getByText('Producto no encontrado')).toBeInTheDocument();
    expect(screen.getByText('PATCH')).toBeInTheDocument();
  });

  it('sin resultados muestra "No hay conflictos pendientes" (no un error)', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) } as Response);
    render(<SyncConflictosClient />);
    await screen.findByText('No hay conflictos pendientes');
  });

  it('sin confirmar NO llama al PATCH de descartar', async () => {
    (global.confirm as jest.Mock).mockReturnValue(false);
    render(<SyncConflictosClient />);
    await screen.findByText('ubicaciones_bodega');
    fireEvent.click(screen.getByText('Descartar'));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.filter((c: any[]) => c[1]?.method === 'PATCH');
      expect(patch.length).toBe(0);
    });
  });

  it('confirmando, "Descartar" hace PATCH con accion=descartar', async () => {
    render(<SyncConflictosClient />);
    await screen.findByText('ubicaciones_bodega');
    fireEvent.click(screen.getByText('Descartar'));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(patch[1].body);
      expect(body.accion).toBe('descartar');
      expect(String(patch[0])).toContain('/api/sync-conflictos/5');
    });
  });

  it('maneja el 409 (ya resuelto) con gracia y actualiza la lista', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/sync-conflictos') && (!init || !init.method)) {
        return { ok: true, json: async () => ({ data: [CONFLICTO] }) } as Response;
      }
      if (url.includes('/api/sync-conflictos/') && init?.method === 'PATCH') {
        return { status: 409, ok: false, json: async () => ({ error: 'Ya resuelto' }) } as Response;
      }
      return { ok: false } as Response;
    });
    render(<SyncConflictosClient />);
    await screen.findByText('ubicaciones_bodega');
    fireEvent.click(screen.getByText('Descartar'));
    await waitFor(() => {
      expect(require('sonner').toast.info).toHaveBeenCalled();
    });
  });
});
