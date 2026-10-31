/**
 * @jest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PrenotaDetallePage } from '@/app/(app)/notas-venta/[id]/client_page';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { rol: 'vendedor' } } }),
}));

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: '1' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/notas-venta/1',
}));

describe('PrenotaDetallePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('smoke test — renderiza sin errores', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        titulo: 'Nota de Venta #1 — 23 Apr 2026',
        nombre_cliente: null,
        kcodclie: null,
        items: [],
      }),
    } as any);

    const { container } = render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);

    expect(container).toBeTruthy();
  });

  test('muestra items de la nota de venta', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        titulo: 'Nota de Venta #1 — 23 Apr 2026',
        nombre_cliente: null,
        kcodclie: null,
        items: [
          {
            id: 1,
            codigo: 'ABC123',
            descripcion: 'Producto Test',
            empresa_id: 2,
            cajas: 1,
            unidades: 6,
            precio: 150,
            stock_referencia: 10,
          },
        ],
      }),
    } as any);

    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);

    await waitFor(() => {
      expect(screen.getAllByText('ABC123').length).toBeGreaterThan(0);
    });
  });

  test('sin items muestra mensaje vacío', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        titulo: 'Nota de Venta #1 — 23 Apr 2026',
        nombre_cliente: null,
        kcodclie: null,
        items: [],
      }),
    } as any);

    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);

    await waitFor(() => {
      expect(screen.getByText(/no hay productos/i)).toBeInTheDocument();
    });
  });

  test('asignar cliente llama al PATCH', async () => {
    global.fetch = jest.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/notas-venta/1') && options?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 1,
            titulo: 'Nota de Venta #1 — 23 Apr 2026',
            nombre_cliente: 'JUAN PEREZ',
            kcodclie: 100,
            items: [],
          }),
        });
      }

      if (url.includes('/api/clientes?q=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [{ id: 100, nombre: 'JUAN PEREZ', telefono: null }],
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: 1,
          titulo: 'Nota de Venta #1 — 23 Apr 2026',
          nombre_cliente: null,
          kcodclie: null,
          items: [],
        }),
      });
    });

    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);

    fireEvent.change(screen.getByPlaceholderText(/buscar cliente/i), {
      target: { value: 'juan' },
    });

    await waitFor(() => {
      expect(screen.getByText('JUAN PEREZ')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('JUAN PEREZ'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/notas-venta/1',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cliente_id: 100 }),
        })
      );
    });
  });

  // ─── Test 5b: Texto renombrado ──────────────────────────────────────
  test('[TEXTO] no aparece "Pre-Nota" ni "pre-nota" en textos visibles del detalle', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        titulo: 'Nota de Venta #1 — 23 Apr 2026',
        nombre_cliente: null,
        kcodclie: null,
        items: [],
      }),
    } as any);

    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);

    await waitFor(() => {
      // El título del heading debe ser "Nota de Venta #1", no "Pre-Nota" como fallback
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.textContent).not.toMatch(/pre-?nota/i);
      // Debe contener "Nota de Venta" o similar
      expect(heading.textContent).toMatch(/nota de venta/i);
    });
  });

  // ─── Test 5: Regresión — detalle sigue pudiendo pagar ──────────────
  test('[REGRESION] detalle puede abrir diálogo de pago y confirmar', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      const urlStr = url.toString();

      // GET detalle con items y saldo pendiente
      if (urlStr.includes('/api/notas-venta/1') && (!opts || opts.method === 'GET')) {
        return {
          ok: true,
          json: async () => ({
            id: 1,
            titulo: 'Nota de Venta #1 — 23 Apr 2026',
            nombre_cliente: 'Juan Perez',
            estado: 'activa',
            total: 100,
            total_pagado: 0,
            saldo_pendiente: 100,
            items: [
              { id: 1, codigo: 'ABC', descripcion: 'Item', cajas: 1, unidades: 1, precio: 100, stock_referencia: 10 },
            ],
          }),
        };
      }

      // GET cuentas activas
      if (urlStr.includes('/api/caja/cuentas')) {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: 1, nombre: 'Caja USD', moneda: 'USD' }],
          }),
        };
      }

      // GET caja config
      if (urlStr.includes('/api/caja/config')) {
        return {
          ok: true,
          json: async () => ({ data: { valor: '980' } }),
        };
      }

      // POST pago
      if (urlStr.includes('/pagar') && opts?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }

      return { ok: true, json: async () => ({}) };
    });

    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);

    // Esperar que cargue el detalle con el botón "Marcar como pagada"
    await waitFor(() => {
      expect(screen.getAllByText('ABC').length).toBeGreaterThan(0);
    });

    const pagarBtn = screen.getByRole('button', { name: /marcar como pagada/i });
    expect(pagarBtn).toBeInTheDocument();

    // Abrir diálogo de pago
    fireEvent.click(pagarBtn);

    // Verificar que el diálogo se abrió (debe mostrar campos de cuenta)
    await waitFor(() => {
      expect(screen.getByText(/cuenta/i)).toBeInTheDocument();
    });

    // Confirmar pago
    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    fireEvent.click(confirmBtn);

    // Verificar que se llamó al POST con el id correcto
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/notas-venta\/1\/pagar/),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});
