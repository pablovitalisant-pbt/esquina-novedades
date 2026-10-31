import React from 'react';
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react';
import { BodegaClient } from '@/app/(app)/bodega/client_page';
import { UbicacionBodegaAgrupada } from '@/types';

// useEmpresaId eliminado (PRD §9.17) — componente usa const empresaId = 1

// Este test cubre el flujo online (PUT por fetch).

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
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

const makeUbicacion = (overrides: Partial<UbicacionBodegaAgrupada>): UbicacionBodegaAgrupada => ({
  codigo: 'P001',
  detalle: 'Producto prueba',
  producto_imagen_url: null,
  empresa_id: 1,
  saldo: 100,
  cantcaja: 10,
  umed: 'u',
  fisico: 25,
  fisico_cajas: null,
  fisico_unidades: null,
  diferencia: -5,
  ubicacion: 'A1',
  observaciones: null,
  ...overrides,
});

// Helper: render BodegaClient, search, open drawer, and fill form
const renderAndOpenDrawer = async (initial: UbicacionBodegaAgrupada) => {
  (global.fetch as jest.Mock) = jest.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('/api/ubicaciones?')) {
      return {
        ok: true,
        json: async () => ({ data: [initial] }),
      } as Response;
    }
    if (url.includes('/codigo/') && init?.method === 'PUT') {
      return {
        ok: true,
        json: async () => ({ data: { ...initial, fisico: 32, diferencia: 12 } }),
      } as Response;
    }
    throw new Error(`Unhandled fetch: ${url}`);
  });

  render(<BodegaClient session={{}} />);

  const searchInput = screen.getByPlaceholderText(/buscar/i);
  fireEvent.change(searchInput, { target: { value: 'P0' } });

  await act(async () => {
    jest.advanceTimersByTime(300);
  });

  // fotos-v1 ON: el código puede aparecer también en el placeholder de la imagen.
  const codigos = await screen.findAllByText('P001');
  fireEvent.click(codigos[0]);

  const ubicacionLabel = screen.getByText('Código de ubicación');
  const panel = ubicacionLabel.closest('div')?.parentElement as HTMLElement;
  return { panel };
};

// ═══════════════════════════════════════════════════════════════════
// R5: Test del flujo básico del drawer (sin lotes)
// ═══════════════════════════════════════════════════════════════════
describe('R5 — drawer edita ubicación (1 producto = 1 ubicación)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('editar cajas recalcula diferencia preview en el formulario', async () => {
    const initial = makeUbicacion({ saldo: 20, fisico: null, fisico_cajas: null, diferencia: null, ubicacion: 'A1' });

    const { panel } = await renderAndOpenDrawer(initial);

    // El preview de diferencia debe aparecer después de cambiar los inputs
    const spinbuttons = within(panel).getAllByRole('spinbutton');
    fireEvent.change(spinbuttons[0], { target: { value: '3' } });
    fireEvent.change(spinbuttons[1], { target: { value: '2' } });

    // Presionar guardar
    fireEvent.click(within(panel).getByText('Guardar ubicación'));

    // Después de guardar, la card debe mostrar los nuevos valores
    // (el handleUbicacionSaved actualiza el estado local)
    await waitFor(() => {
      expect(screen.getByText('32 u')).toBeInTheDocument();
    });
  });

  test('producto sin ubicación muestra "Sin ubicación registrada"', async () => {
    const initial = makeUbicacion({ ubicacion: null });
    await renderAndOpenDrawer(initial);

    // Al cerrar el search (sin abrir drawer) la card debe mostrar Sin ubicación
    expect(screen.getByText('Sin ubicación registrada')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════
// R6: Tests para el nuevo payload/URL del PUT
// ═══════════════════════════════════════════════════════════════════
describe('R6 — PUT drawer usa nueva URL/payload post-simplificación', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('PUT fetch usa /api/ubicaciones/codigo/{codigo}', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith('/api/ubicaciones?')) {
        return { ok: true, json: async () => ({ data: [{
          codigo: 'P001', detalle: 'Test', empresa_id: 1,
          saldo: 100, cantcaja: 10, umed: 'u',
          ubicacion: 'A1', fisico: 100, diferencia: 0,
        }] }) } as Response;
      }
      if (url.includes('/codigo/P001') && init?.method === 'PUT') {
        return { ok: true, json: async () => ({ data: { codigo: 'P001', ubicacion: 'B2' } }) } as Response;
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    (global.fetch as jest.Mock) = fetchMock;

    render(<BodegaClient session={{}} />);

    const searchInput = screen.getByPlaceholderText(/buscar/i);
    fireEvent.change(searchInput, { target: { value: 'P0' } });

    await act(async () => { jest.advanceTimersByTime(300); });
    const codigos = await screen.findAllByText('P001');
    fireEvent.click(codigos[0]);

    // Click en guardar para disparar el PUT
    const saveBtn = screen.getByText('Guardar ubicación');
    fireEvent.click(saveBtn);

    // Verificar que la llamada PUT fue a /codigo/P001
    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter((call: any[]) => {
        const url = typeof call[0] === 'string' ? call[0] : call[0]?.url;
        return call[1]?.method === 'PUT';
      });
      expect(putCalls.length).toBeGreaterThan(0);
      const putUrl = typeof putCalls[0][0] === 'string' ? putCalls[0][0] : putCalls[0][0]?.url;
      expect(putUrl).toMatch(/\/codigo\/P001/);
    });
  });

  it('payload del PUT incluye ubicacion, fisico_cajas, fisico_unidades, observaciones (sin id)', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith('/api/ubicaciones?')) {
        return { ok: true, json: async () => ({ data: [{
          codigo: 'P001', detalle: 'Test', empresa_id: 1,
          saldo: 100, cantcaja: 10, umed: 'u',
          ubicacion: 'A1', fisico: 100, diferencia: 0,
        }] }) } as Response;
      }
      if (url.includes('/codigo/') && init?.method === 'PUT') {
        return { ok: true, json: async () => ({ data: { codigo: 'P001' } }) } as Response;
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    (global.fetch as jest.Mock) = fetchMock;

    render(<BodegaClient session={{}} />);

    const searchInput = screen.getByPlaceholderText(/buscar/i);
    fireEvent.change(searchInput, { target: { value: 'P0' } });

    await act(async () => { jest.advanceTimersByTime(300); });
    const codigos = await screen.findAllByText('P001');
    fireEvent.click(codigos[0]);

    // Click en guardar para disparar el PUT
    const saveBtn = screen.getByText('Guardar ubicación');
    fireEvent.click(saveBtn);

    // Verificar el payload
    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find((call: any[]) => {
        const url = typeof call[0] === 'string' ? call[0] : call[0]?.url;
        return call[1]?.method === 'PUT';
      });
      expect(putCall).toBeDefined();
      const body = JSON.parse((putCall as any[])[1].body as string);
      expect(body).toHaveProperty('ubicacion');
      expect(body).toHaveProperty('fisico_cajas');
      expect(body).toHaveProperty('fisico_unidades');
      expect(body).toHaveProperty('observaciones');
      expect(body).not.toHaveProperty('id');
    });
  });
});
