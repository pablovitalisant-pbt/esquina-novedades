/**
 * @jest-environment jsdom
 *
 * Fase B — Slice 1: R8 — Frontend maneja error de stock insuficiente.
 * Render real + interaccion real + afirmacion sobre comportamiento observable.
 *
 * 4 sitios:
 * - AgregarANotaVentaModal.handleAgregar (POST items)
 * - PrenotaDetallePage.agregarProducto (POST items)
 * - PrenotaDetallePage.PrenotaItemsTable.handleGuardar (PATCH items)
 * - PrenotaDetallePage.eliminarItem (DELETE items)
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgregarANotaVentaModal } from '@/components/AgregarANotaVentaModal';
import { PrenotaDetallePage } from '@/app/(app)/notas-venta/[id]/client_page';
import { toast } from 'sonner';

// ─── Mocks ──────────────────────────────────────────────────────
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock('jspdf', () => jest.fn(() => ({ internal: { pageSize: { getWidth: () => 200, getHeight: () => 280 } }, text: jest.fn(), save: jest.fn(), setFontSize: jest.fn(), addPage: jest.fn() })));
jest.mock('jspdf-autotable', () => jest.fn());

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), useParams: () => ({ id: '1' }) }));

global.fetch = jest.fn();

const mockProducto = { codigo: 'PROD-01', detalle: 'Test', imagen_url: null, empresa_id: 1, prcventa: 10, cantcaja: 1, saldo: 5 };

// ═══════════════════════════════════════════════════════════════════
// 1. AgregarANotaVentaModal.handleAgregar
// ═══════════════════════════════════════════════════════════════════
describe('R8a — AgregarANotaVentaModal fallo stock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST items 400 → toast.error con mensaje del backend, NO cierra modal', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false, status: 400, json: async () => ({ error: 'Stock insuficiente' }),
    });

    const onClose = jest.fn();
    render(<AgregarANotaVentaModal open={true} onClose={onClose} producto={mockProducto} />);

    expect(screen.getByText('Agregar a Nota de Venta')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Agregar'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/stock/i));
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Agregar a Nota de Venta')).toBeInTheDocument();
  });

  it('POST items 200 → toast.success, modal se cierra', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 1 }) });

    const onClose = jest.fn();
    render(<AgregarANotaVentaModal open={true} onClose={onClose} producto={mockProducto} />);

    fireEvent.click(screen.getByText('Agregar'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
    expect(onClose).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2-4. PrenotaDetallePage — render + interaccion
// ═══════════════════════════════════════════════════════════════════
describe('R8b-d — PrenotaDetallePage manejo errores stock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    // Fetch inicial: GET /api/notas-venta/{id} — nota con items y cliente
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 1, estado: 'activa', titulo: 'Nota test',
        cliente_nombre: 'Cliente test',
        cliente_id: null, total: 50, saldo_pendiente: 50, total_pagado: 0,
        items: [
          { id: 10, codigo: 'ITEM-1', descripcion: 'Item test', cajas: 1, unidades: 5, precio: 10 },
        ],
      }),
    });
  });

  it('agregarProducto con POST 400 → toast.error, NO fetchPrenota posterior', async () => {
    // Busqueda de productos devuelve un resultado
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true, json: async () => ({ data: [{ codigo: 'NUEVO', detalle: 'Nuevo', empresa_id: 1, prcventa: 15, cantcaja: 1, saldo: 3 }] }),
    });
    // POST items falla con 400
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false, status: 400, json: async () => ({ error: 'Stock insuficiente' }),
    });

    render(<PrenotaDetallePage session={{ id: '1', rol: 'vendedor', empresas: [1] } as any} params={{ id: '1' }} />);

    // Esperar a que la nota cargue
    await screen.findByText('Nota test');

    // Contar fetch calls hasta ahora: 1 (la carga inicial de la nota)
    const callsBefore = (global.fetch as jest.Mock).mock.calls.length;

    // Buscar producto por codigo
    const searchInput = screen.getByPlaceholderText(/buscar por c[oó]digo/i);
    fireEvent.change(searchInput, { target: { value: 'NUEVO' } });

    // Click en el resultado
    await screen.findByText('Nuevo');
    fireEvent.click(screen.getByText('Nuevo'));

    // Debe mostrar toast.error con mensaje del backend (stock)
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/stock/i));
    });

    // NO debe haber fetch extra de refresco (fetchPrenota no se ejecuta)
    // Contar calls totales: carga inicial + busqueda + POST items = 3
    // Si hubiera fetchPrenota, habria una 4ta llamada GET a /api/notas-venta
    const fetchCalls = (global.fetch as jest.Mock).mock.calls;
    const finalFetches = fetchCalls.filter((c: any) => c[0]?.includes?.('/api/notas-venta/')).length;
    // Despues del POST fallido no debe haber un GET de refresco adicional
    expect(finalFetches).toBeLessThanOrEqual(callsBefore + 1); // solo el GET inicial
    // Busqueda y POST items NO van a /api/notas-venta/{id}
  });

  it('handleGuardar con PATCH 400 → toast.error, formulario de edicion sigue visible', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false, status: 400, json: async () => ({ error: 'Stock insuficiente al editar' }),
    });

    render(<PrenotaDetallePage session={{ id: '1', rol: 'vendedor', empresas: [1] } as any} params={{ id: '1' }} />);

    // Esperar a que cargue la nota y los items sean visibles
    await screen.findByText('Nota test');
    await screen.findByText('ITEM-1');

    // Click "Editar" en el item para entrar en modo edicion
    fireEvent.click(screen.getByText('Editar'));
    await screen.findByText('Guardar');
    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/stock/i));
    });

    // El formulario de edicion SIGUE visible (no sale del modo edicion)
    expect(screen.getByText('Guardar')).toBeInTheDocument();
    // El boton "Editar" NO debe aparecer (no se salio del modo edicion)
    expect(screen.queryByText('Editar')).not.toBeInTheDocument();
  });

  it('eliminarItem con DELETE 400 → toast.error, NO fetchPrenota posterior', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false, status: 400, json: async () => ({ error: 'Stock insuficiente al eliminar' }),
    });

    render(<PrenotaDetallePage session={{ id: '1', rol: 'vendedor', empresas: [1] } as any} params={{ id: '1' }} />);

    // Esperar a que cargue la nota
    await screen.findByText('Nota test');
    await screen.findByText('ITEM-1');

    const callsBefore = (global.fetch as jest.Mock).mock.calls.length;

    // Click "Editar" para que aparezca el boton Eliminar
    fireEvent.click(screen.getByText('Editar'));
    await screen.findByText('Eliminar');
    fireEvent.click(screen.getByText('Eliminar'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/stock/i));
    });

    // NO debe haber fetch extra de refresco
    const fetchCalls = (global.fetch as jest.Mock).mock.calls;
    const finalFetches = fetchCalls.filter((c: any) => c[0]?.includes?.('/api/notas-venta/')).length;
    expect(finalFetches).toBeLessThanOrEqual(callsBefore + 1); // solo el GET inicial
  });
});
