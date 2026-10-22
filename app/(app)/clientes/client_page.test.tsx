/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClientesPage } from './client_page';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('lucide-react', () => new Proxy({}, { get: () => () => null }));

const fetchMock = jest.fn();
global.fetch = fetchMock as any;

const CLIENTE = { id: 'cli-1', nombre: 'Juan', telefono: null, direccion: null, notas: null, created_at: '2026-08-01' };

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
});

describe('app/(app)/clientes — carga y borrado por API', () => {
  it('carga con una sola llamada a /api/clientes', async () => {
    render(<ClientesPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/clientes');
  });

  it('DELETE va a la API y 409 muestra error', async () => {
    global.confirm = jest.fn(() => true) as any;
    fetchMock.mockImplementation(async (_u: string, init?: any) =>
      init?.method === 'DELETE'
        ? { ok: false, status: 409, json: async () => ({}) }
        : { ok: true, json: async () => ({ data: [CLIENTE] }) });
    render(<ClientesPage />);
    await screen.findByText('Juan');
    fireEvent.click(screen.getByLabelText('Eliminar Juan'));
    await waitFor(() => expect(require('sonner').toast.error).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/clientes/cli-1', { method: 'DELETE' });
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
    expect(screen.getByText('Saldo a favor: $40')).toBeInTheDocument();
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
    expect(screen.getByText('Saldo a favor: $40')).toBeInTheDocument();
    expect(screen.queryByText(/Saldo a favor:/i)).toBeInTheDocument();
    // Solo una fila muestra el saldo.
    expect(screen.getAllByText(/Saldo a favor:/i)).toHaveLength(1);
  });
});
