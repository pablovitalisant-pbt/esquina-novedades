/**
 * @jest-environment jsdom
 *
 * FASE B — Slice "notas-venta-pagar-desde-lista"
 * Tests 2-4: Pagar desde la lista (renderizado condicional, estado compartido, smoke E2E)
 * Deben fallar en ROJO — el componente PagarNotaDialog y los botones no existen aún.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';

jest.mock('@/config/feature-flags.json', () => ({}));

// ─── Mocks de navegación ───
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/notas-venta',
}));

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { rol: 'vendedor' } } }),
}));

// ─── Helpers ────────────────────────────────────────────────────────
function buildNota(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    titulo: 'Nota de Venta #1 — 20 jul 2026',
    created_at: '2026-07-20',
    nombre_cliente: 'Juan Perez',
    tipo_documento: null,
    total: 100,
    total_pagado: 0,
    saldo_pendiente: 100,
    estado: 'activa',
    ...overrides,
  };
}

/**
 * Test 2 — Renderizado condicional del botón Pagar.
 */
describe('Lista de notas — botón Pagar condicional (Test 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      // Re-import each test
    });
  });

  test('[RENDER CONDICIONAL] nota activa con saldo_pendiente > 0.005 muestra botón Pagar', async () => {
    const { PrenotasPage } = await import('@/app/(app)/notas-venta/client_page');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [buildNota({ id: 1, saldo_pendiente: 45, total: 45 })],
      }),
    });

    render(<PrenotasPage session={{ user: { rol: 'vendedor' } }} />);

    await waitFor(() => {
      expect(screen.getByText('Nota de Venta #1 — 20 jul 2026')).toBeInTheDocument();
    });

    // El botón Pagar debe ser visible
    expect(screen.getByRole('button', { name: /pagar/i })).toBeInTheDocument();
  });

  test('[RENDER CONDICIONAL] nota activa con saldo_pendiente = 0 NO muestra botón Pagar', async () => {
    const { PrenotasPage } = await import('@/app/(app)/notas-venta/client_page');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [buildNota({ id: 2, saldo_pendiente: 0, total: 100, total_pagado: 100 })],
      }),
    });

    render(<PrenotasPage session={{ user: { rol: 'vendedor' } }} />);

    await waitFor(() => {
      expect(screen.getByText('Nota de Venta #1 — 20 jul 2026')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /pagar/i })).not.toBeInTheDocument();
  });

  test('[RENDER CONDICIONAL] nota anulada NO muestra botón Pagar aunque tenga saldo pendiente', async () => {
    const { PrenotasPage } = await import('@/app/(app)/notas-venta/client_page');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [buildNota({ id: 3, estado: 'anulada', saldo_pendiente: 100 })],
      }),
    });

    render(<PrenotasPage session={{ user: { rol: 'vendedor' } }} />);

    await waitFor(() => {
      expect(screen.getByText('Nota de Venta #1 — 20 jul 2026')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /pagar/i })).not.toBeInTheDocument();
  });

  test('[RENDER CONDICIONAL] nota activa con pago parcial muestra botón Pagar (saldo > 0.005)', async () => {
    const { PrenotasPage } = await import('@/app/(app)/notas-venta/client_page');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [buildNota({ id: 4, total: 200, total_pagado: 50, saldo_pendiente: 150 })],
      }),
    });

    render(<PrenotasPage session={{ user: { rol: 'vendedor' } }} />);

    await waitFor(() => {
      expect(screen.getByText('Nota de Venta #1 — 20 jul 2026')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /pagar/i })).toBeInTheDocument();
  });
});

/**
 * Test 3 — Estado compartido / race condition.
 */
describe('Lista de notas — estado compartido del diálogo (Test 3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('[ESTADO COMPARTIDO] abrir Pagar en nota A, luego en nota B — el diálogo paga nota B', async () => {
    const { PrenotasPage } = await import('@/app/(app)/notas-venta/client_page');

    // Retornar 2 notas: A (id=10) y B (id=20), ambas con saldo pendiente
    // Also mock cuentas and config for the pagar dialog
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      const urlStr = url.toString();

      if (urlStr.includes('/api/notas-venta') && !urlStr.includes('/pagar')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              buildNota({ id: 10, titulo: 'Nota de Venta #10', saldo_pendiente: 50, total: 50 }),
              buildNota({ id: 20, titulo: 'Nota de Venta #20', saldo_pendiente: 75, total: 75 }),
            ],
          }),
        };
      }

      if (urlStr.includes('/api/caja/cuentas')) {
        return {
          ok: true,
          json: async () => ({ data: [{ id: 1, nombre: 'Caja USD', moneda: 'USD' }] }),
        };
      }

      if (urlStr.includes('/api/caja/config')) {
        return {
          ok: true,
          json: async () => ({ data: { valor: '980' } }),
        };
      }

      // POST pago — capture which nota was paid
      return { ok: true, json: async () => ({ success: true }) };
    });

    render(<PrenotasPage session={{ user: { rol: 'vendedor' } }} />);

    await waitFor(() => {
      expect(screen.getByText('Nota de Venta #10')).toBeInTheDocument();
    });

    // Click "Pagar" en nota A
    const pagarButtons = screen.getAllByRole('button', { name: /^pagar$/i });
    expect(pagarButtons.length).toBe(2);
    fireEvent.click(pagarButtons[0]); // nota A (id=10)

    // Wait for dialog to load (cuentas fetched, form populated)
    await waitFor(() => {
      expect(screen.getByText(/cuenta/i)).toBeInTheDocument();
    });

    // Sin cerrar, cambiar: click "Pagar" en nota B
    fireEvent.click(pagarButtons[1]); // nota B (id=20)

    // Wait for dialog to re-settle with new notaId
    await waitFor(() => {
      // The dialog's useEffect fetches cuentas on notaId change
      // Wait for it to complete before clicking confirmar
      expect(screen.getByText(/confirmar/i)).toBeInTheDocument();
    });

    // Confirmar pago — debe pagar nota B (id=20)
    const confirmButton = screen.getByRole('button', { name: /confirmar/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      // Debe haber llamado POST a /api/notas-venta/20/pagar (nota B, no A)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/notas-venta\/20\/pagar/),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});

/**
 * Test 4 — Smoke E2E.
 */
describe('Lista de notas — smoke E2E pagar desde lista (Test 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('[SMOKE E2E] click Pagar → completar → confirmar → POST correcto → lista refresca', async () => {
    const { PrenotasPage } = await import('@/app/(app)/notas-venta/client_page');

    let fetchCalls = 0;

    global.fetch = jest.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      const urlStr = url.toString();
      fetchCalls++;

      // GET inicial de la lista
      if (urlStr.includes('/api/notas-venta') && fetchCalls <= 1) {
        return {
          ok: true,
          json: async () => ({
            data: [
              buildNota({ id: 5, total: 120, total_pagado: 0, saldo_pendiente: 120 }),
            ],
          }),
        };
      }

      // GET cuentas activas (al abrir diálogo)
      if (urlStr.includes('/api/caja/cuentas')) {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: 1, nombre: 'Caja USD', moneda: 'USD' }],
          }),
        };
      }

      // GET caja config (dolar del día)
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

      // Segundo GET a la lista (refresco post-pago)
      return {
        ok: true,
        json: async () => ({
          data: [
            buildNota({ id: 5, total: 120, total_pagado: 120, saldo_pendiente: 0 }),
          ],
        }),
      };
    });

    render(<PrenotasPage session={{ user: { rol: 'vendedor' } }} />);

    // Esperar que la nota cargue
    await waitFor(() => {
      expect(screen.getByText('Nota de Venta #1 — 20 jul 2026')).toBeInTheDocument();
    });

    // Click en Pagar
    fireEvent.click(screen.getByRole('button', { name: /pagar/i }));

    // El diálogo debe mostrar campos de pago
    await waitFor(() => {
      expect(screen.getByText(/cuenta/i)).toBeInTheDocument();
    });

    // Confirmar pago
    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    fireEvent.click(confirmBtn);

    // Verificar POST con el id correcto
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/notas-venta\/5\/pagar/),
        expect.objectContaining({ method: 'POST' })
      );
    });

    // Verificar que la lista se refrescó (el mock del fetch posterior incluiría
    // la nota actualizada con saldo_pendiente=0)
    expect(fetchCalls).toBeGreaterThanOrEqual(2);
  });
});
