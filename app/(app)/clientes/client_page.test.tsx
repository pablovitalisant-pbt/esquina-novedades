/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClientesPage } from './client_page';

var dbMock: any;

jest.mock('@powersync/react', () => ({
  usePowerSync: () => dbMock,
  PowerSyncContext: { Provider: ({ children }: any) => children },
}));
jest.mock('@/lib/powersync/PowerSyncProvider', () => ({
  PowerSyncProvider: ({ children }: any) => children,
}));
jest.mock('@/config/feature-flags.json', () => ({
  get 'clientes-offline-lectura'() {
    return (globalThis as any).__clientesOffline === true;
  },
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('lucide-react', () => new Proxy({}, { get: () => () => null }));

const fetchMock = jest.fn();
global.fetch = fetchMock as any;

const CLIENTE = { id: 'cli-1', nombre: 'Juan', telefono: null, direccion: null, notas: null, created_at: '2026-08-01' };

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).__clientesOffline = false;
  dbMock = { getAll: jest.fn(), execute: jest.fn().mockResolvedValue(undefined) };
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
});

describe('app/(app)/clientes — clientes-offline-lectura (regresión)', () => {
  it('flag en false: usa fetch a /api/clientes', async () => {
    render(<ClientesPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(dbMock.getAll).not.toHaveBeenCalled();
  });

  it('flag en true: fetchClientes usa la query local (NO fetch)', async () => {
    (globalThis as any).__clientesOffline = true;
    dbMock.getAll.mockResolvedValue([CLIENTE]);
    render(<ClientesPage />);
    await screen.findByText('Juan');
    expect(dbMock.getAll).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flag en true: DELETE bloquea si hay nota activa (dos pasos, sin encolar)', async () => {
    (globalThis as any).__clientesOffline = true;
    global.confirm = jest.fn(() => true) as any;
    // fetchClientes → clientes; chequeo 1 → prenotas con estado activa
    dbMock.getAll.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FROM prenotas')) return [{ estado: 'activa' }];
      return [CLIENTE];
    });
    render(<ClientesPage />);
    await screen.findByText('Juan');
    fireEvent.click(screen.getByLabelText('Eliminar Juan'));
    await waitFor(() => expect(require('sonner').toast.error).toHaveBeenCalled());
    expect(dbMock.execute).not.toHaveBeenCalled();
  });

  it('flag en true: DELETE procede si solo notas anuladas sin movimientos de caja', async () => {
    (globalThis as any).__clientesOffline = true;
    global.confirm = jest.fn(() => true) as any;
    dbMock.getAll.mockImplementation(async (sql: string) => {
      const s = String(sql);
      // caja_movimiento_notas antes que prenotas (el SQL del chequeo de movs
      // también contiene 'FROM prenotas' en su subquery IN)
      if (s.includes('FROM caja_movimiento_notas')) return [];
      if (s.includes('FROM prenotas')) return [{ estado: 'anulada' }];
      return [CLIENTE];
    });
    render(<ClientesPage />);
    await screen.findByText('Juan');
    fireEvent.click(screen.getByLabelText('Eliminar Juan'));
    await waitFor(() => expect(dbMock.execute).toHaveBeenCalled());
    const sql = dbMock.execute.mock.calls[0][0] as string;
    expect(sql).toContain('DELETE FROM clientes');
    expect(require('sonner').toast.success).toHaveBeenCalled();
  });

  it('flag en true: DELETE bloquea si hay movimiento de caja en notas anuladas', async () => {
    (globalThis as any).__clientesOffline = true;
    global.confirm = jest.fn(() => true) as any;
    dbMock.getAll.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes('FROM caja_movimiento_notas')) return [{ x: 1 }];
      if (s.includes('FROM prenotas')) return [{ estado: 'anulada' }];
      return [CLIENTE];
    });
    render(<ClientesPage />);
    await screen.findByText('Juan');
    fireEvent.click(screen.getByLabelText('Eliminar Juan'));
    await waitFor(() => expect(require('sonner').toast.error).toHaveBeenCalled());
    expect(dbMock.execute).not.toHaveBeenCalled();
  });
});

// ─── Slice 3c — saldo a favor visible (flag off, rama online) ───────
describe('app/(app)/clientes — saldo a favor (3c)', () => {
  const renderCon = (clientes: any[]) => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: clientes }) });
    return render(<ClientesPage />);
  };

  it('TEST 4: saldo_favor > 0.005 → texto "Saldo a favor: $X.XX" visible', async () => {
    renderCon([{ ...CLIENTE, nombre: 'Juana', saldo_favor: 40 }]);
    await screen.findByText('Juana');
    expect(screen.getByText('Saldo a favor: $40.00')).toBeInTheDocument();
  });

  it('TEST 5: saldo_favor en 0 → texto NO se renderiza', async () => {
    renderCon([{ ...CLIENTE, nombre: 'Pedro', saldo_favor: 0 }]);
    await screen.findByText('Pedro');
    expect(screen.queryByText(/Saldo a favor:/i)).toBeNull();
  });

  it('TEST 5b: saldo_favor negativo (imposible por diseño) → no muestra nada', async () => {
    renderCon([{ ...CLIENTE, nombre: 'Ana', saldo_favor: -5 }]);
    await screen.findByText('Ana');
    expect(screen.queryByText(/Saldo a favor:/i)).toBeNull();
  });

  it('TEST 6: smoke — cliente con saldo y cliente sin saldo, ambos correctos', async () => {
    renderCon([
      { ...CLIENTE, id: 'c1', nombre: 'Juana', saldo_favor: 40 },
      { ...CLIENTE, id: 'c2', nombre: 'Pedro', saldo_favor: 0 },
    ]);
    await screen.findByText('Juana');
    await screen.findByText('Pedro');
    expect(screen.getByText('Saldo a favor: $40.00')).toBeInTheDocument();
    expect(screen.queryByText(/Saldo a favor:/i)).toBeInTheDocument();
    // Solo una fila muestra el saldo.
    expect(screen.getAllByText(/Saldo a favor:/i)).toHaveLength(1);
  });
});
