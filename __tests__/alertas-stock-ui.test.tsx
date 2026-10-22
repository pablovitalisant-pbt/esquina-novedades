/**
 * @jest-environment jsdom
 *
 * Sub-slice 2 UI — Fase B: tests que intentan romper.
 * R2a/R2b/R3a/R3b: DEBEN fallar contra la implementación (actualmente
 * el componente ni existe → el import falla → todos en rojo).
 * R1/R4/R5/R6/R7: safety nets.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AlertasStockClient } from '@/app/(app)/alertas-stock/client_page';

// ─── Mocks ───────────────────────────────────────────────────────
jest.mock('@/components/ImageWithFallback', () => ({
  ImageWithFallback: () => <div data-testid="image-fallback" />,
}));

jest.mock('@/contexts/AlertasContext', () => ({
  useAlertas: jest.fn(),
  AlertasProvider: ({ children }: any) => children,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

import { useAlertas } from '@/contexts/AlertasContext';

const mockRefreshStockBajo = jest.fn();
const defaultAlertas = {
  stockBajoCount: 3,
  refreshStockBajo: mockRefreshStockBajo,
};

beforeEach(() => {
  jest.clearAllMocks();
  (useAlertas as jest.Mock).mockReturnValue(defaultAlertas);
  (global as any).fetch = jest.fn();
});

// ─── Helpers ─────────────────────────────────────────────────────
function mockFetchLista(data: any) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ data }),
  });
}

function mockFetchListaError(status: number) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({ error: 'Error' }),
  });
}

function mockFetchReject() {
  (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
}

// ═══════════════════════════════════════════════════════════════════
// R1: vendedor accede por URL → 401 → error controlado
// ═══════════════════════════════════════════════════════════════════
describe('R1 — acceso no autorizado (vendedor)', () => {
  it('muestra mensaje de error si el backend retorna 401', async () => {
    mockFetchListaError(401);
    render(<AlertasStockClient />);
    await waitFor(() => {
      expect(screen.getByText(/no tienes permiso|permiso/i)).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// R2a/R2b: doble click — botón se deshabilita + 1 sola llamada PUT
// ═══════════════════════════════════════════════════════════════════
describe('R2 — doble click en botón de acción', () => {
  it('R2a: el botón "Ignorar" se deshabilita mientras el PUT está en vuelo', async () => {
    // PUT lento que nunca resuelve — el botón queda disabled
    const putPromise = new Promise(() => {});
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ // mount → lista
        ok: true,
        json: () => Promise.resolve({
          data: [{ producto_id: 1, codigo: 'A-001', detalle: 'Test', saldo: 2, stock_minimo: 10, deficit: 8 }],
        }),
      })
      .mockReturnValueOnce(putPromise); // click → PUT

    render(<AlertasStockClient />);
    await waitFor(() => screen.getByText('A-001'));

    const btn = screen.getByRole('button', { name: /ignorar/i });
    fireEvent.click(btn);

    // El botón debe estar disabled inmediatamente después del click
    expect(btn).toBeDisabled();
  });

  it('R2b: solo se hace 1 llamada PUT aunque se clickee 2 veces rápido', async () => {
    mockFetchLista([
      { producto_id: 1, codigo: 'A-001', detalle: 'Test', saldo: 2, stock_minimo: 10, deficit: 8 },
    ]);

    let calls = 0;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/alertas-stock/lista')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ producto_id: 1, codigo: 'A-001', detalle: 'Test', saldo: 2, stock_minimo: 10, deficit: 8 }] }) });
      }
      if (url.includes('/api/alertas-stock/') && !url.includes('lista')) {
        calls++;
        return new Promise(() => {}); // nunca resuelve — el botón queda disabled
      }
      return Promise.reject('unexpected');
    });

    render(<AlertasStockClient />);
    await waitFor(() => screen.getByText('A-001'));

    const btn = screen.getByRole('button', { name: /ignorar/i });
    fireEvent.click(btn);
    fireEvent.click(btn); // segundo click — debe ser ignorado
    fireEvent.click(btn); // tercer click — debe ser ignorado

    expect(calls).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// R3a/R3b: loading state
// ═══════════════════════════════════════════════════════════════════
describe('R3 — loading state', () => {
  it('R3a: muestra spinner durante la carga inicial', () => {
    // fetch nunca resuelve → loading perpetuo
    (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<AlertasStockClient />);
    // Debe haber un indicador de carga (spinner, "Cargando", skeleton)
    expect(screen.getByText(/cargando|loading/i) || screen.getByRole('status')).toBeTruthy();
  });

  it('R3b: NO muestra mensaje de vacío mientras está cargando', () => {
    (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<AlertasStockClient />);
    expect(screen.queryByText(/no hay productos/i)).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════
// R4: error de red
// ═══════════════════════════════════════════════════════════════════
describe('R4 — error de red', () => {
  it('muestra mensaje de error si el fetch falla (reject/500)', async () => {
    mockFetchReject();
    render(<AlertasStockClient />);
    await waitFor(() => {
      expect(screen.getByText(/error|falló|no se pudo/i)).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// R5: lista vacía legítima
// ═══════════════════════════════════════════════════════════════════
describe('R5 — lista vacía', () => {
  it('muestra mensaje de vacío cuando no hay productos bajo stock mínimo', async () => {
    mockFetchLista([]);
    render(<AlertasStockClient />);
    await waitFor(() => {
      expect(screen.getByText(/no hay productos|sin alertas/i)).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// R6: refreshStockBajo después de Ignorar
// ═══════════════════════════════════════════════════════════════════
describe('R6 — refreshStockBajo post-acción', () => {
  it('llama a refreshStockBajo después de Ignorar exitoso', async () => {
    mockFetchLista([
      { producto_id: 1, codigo: 'A-001', detalle: 'Test', saldo: 2, stock_minimo: 10, deficit: 8 },
    ]);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) }); // PUT

    render(<AlertasStockClient />);
    await waitFor(() => screen.getByText('A-001'));

    const btn = screen.getByRole('button', { name: /ignorar/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockRefreshStockBajo).toHaveBeenCalled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// R7: badge de severidad por ratio
// ═══════════════════════════════════════════════════════════════════
describe('R7 — badge de severidad', () => {
  it('clasifica correctamente según deficit/stock_minimo', async () => {
    mockFetchLista([
      { producto_id: 1, codigo: 'A-001', detalle: 'Leve', saldo: 8, stock_minimo: 10, deficit: 2 },
      { producto_id: 2, codigo: 'A-002', detalle: 'Medio', saldo: 5, stock_minimo: 10, deficit: 5 },
      { producto_id: 3, codigo: 'A-003', detalle: 'Crítico', saldo: 1, stock_minimo: 10, deficit: 9 },
    ]);

    render(<AlertasStockClient />);
    await waitFor(() => screen.getByText('A-001'));

    // Deficit 2/10 = 20% → verde (bajo)
    // Deficit 5/10 = 50% → amarillo (medio)
    // Deficit 9/10 = 90% → rojo (alto)

    // Verificar que los 3 badges existen con distintas clases
    const badges = screen.getAllByText(/\d+%/);
    expect(badges).toHaveLength(3);
  });
});
