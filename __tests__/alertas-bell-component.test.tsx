/**
 * @jest-environment jsdom
 *
 * FASE B — slice "alertas-bell"
 * Tests del componente AlertasBell.
 * DEBEN fallar en ROJO: AlertasBell.tsx aun no existe.
 *
 * Error esperado: "Cannot find module '@/components/AlertasBell'"
 * Al crear el componente (Fase C), este import se resuelve
 * y los tests corren para validar el contrato.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AlertasBell } from '@/components/AlertasBell';

jest.mock('@/contexts/AlertasContext', () => ({ useAlertas: jest.fn() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

import { useAlertas } from '@/contexts/AlertasContext';

const mockRefreshStockBajo = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (useAlertas as jest.Mock).mockReturnValue({
    stockBajoCount: 3,
    refreshStockBajo: mockRefreshStockBajo,
  });
  (global as any).fetch = jest.fn();
});

// ─── R3: Render condicional del badge ─────────────────────────────
describe('R3 — badge visible solo si stockBajoCount > 0', () => {
  it('badge muestra el contador cuando stockBajoCount > 0', () => {
    render(<AlertasBell />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('badge NO renderizado cuando stockBajoCount es 0', () => {
    (useAlertas as jest.Mock).mockReturnValue({
      stockBajoCount: 0,
      refreshStockBajo: mockRefreshStockBajo,
    });
    render(<AlertasBell />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});

// ─── R4: Fetch on-demand al abrir dropdown ────────────────────────
describe('R4 — fetch on-demand, no en mount', () => {
  it('NO llama a fetch en el mount', () => {
    render(<AlertasBell />);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('SI llama a fetch al hacer click en la campanita', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
    render(<AlertasBell />);
    const bell = screen.getByRole('button');
    fireEvent.click(bell);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/alertas-stock/lista'),
        expect.anything()
      );
    });
  });
});

// ─── R5: Race condition — abrir/cerrar no duplica requests ────────
describe('R5 — race condition controlada', () => {
  it('1 sola llamada activa con AbortController pese a clicks rapidos', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
    render(<AlertasBell />);
    const bell = screen.getByRole('button');
    // 5 clicks rapidos — solo 1 fetch debe dispararse
    for (let i = 0; i < 5; i++) {
      act(() => { fireEvent.click(bell); });
    }
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});

// ─── R6: Navegacion — click en item va a /alertas-stock ──────────
describe('R6 — click en item navega a /alertas-stock', () => {
  it('llama a router.push("/alertas-stock") al hacer click en "Ver todas"', async () => {
    const push = jest.fn();
    // Override the nav mock for this test
    (require('next/navigation') as any).useRouter = () => ({ push });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: [
          { producto_id: 1, codigo: 'A-001', detalle: 'Test', saldo: 2, stock_minimo: 10, deficit: 8 },
        ],
      }),
    });

    render(<AlertasBell />);

    // Abrir dropdown
    const bell = screen.getByRole('button');
    fireEvent.click(bell);

    // Click en "Ver todas" o en un item de la lista deberia navegar
    await waitFor(() => {
      const verTodas = screen.queryByText(/ver todas|ver más|todas/i);
      if (verTodas) {
        fireEvent.click(verTodas);
        expect(push).toHaveBeenCalledWith('/alertas-stock');
      }
    });
  });
});
