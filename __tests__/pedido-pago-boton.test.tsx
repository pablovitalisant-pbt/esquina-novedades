/**
 * Fase B — N02c: botón de pago de la reserva pública.
 * Rompe: doble clic, éxito, error HTTP/red, respuesta sin init_point y reintento.
 */
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { PedidoPagoBoton } from '@/components/PedidoPagoBoton';

const mockRedirigir = jest.fn();
jest.mock('@/lib/redirigir', () => ({ redirigirA: (...a: any[]) => mockRedirigir(...a) }));

const UUID = '6c1f0a2e-8b3d-4a5f-9c7e-1d2b3a4c5d6e';
const boton = () => screen.getByRole('button', { name: /pagar con mercado pago/i });
const fetchMock = () => (global as any).fetch as jest.Mock;

function mockFetch(respuesta: any) {
  (global as any).fetch = jest.fn(() => respuesta);
}

beforeEach(() => jest.clearAllMocks());

describe('PedidoPagoBoton', () => {
  test('doble clic durante la petición → una sola llamada; éxito redirige', async () => {
    let resolver: (v: any) => void = () => {};
    mockFetch(new Promise((r) => { resolver = r; }));
    render(<PedidoPagoBoton pedidoId={UUID} />);
    fireEvent.click(boton());
    fireEvent.click(boton());
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(fetchMock()).toHaveBeenCalledWith(
      `/api/pedidos/${UUID}/pagar`,
      expect.objectContaining({ method: 'POST' }),
    );
    resolver({ ok: true, json: async () => ({ init_point: 'https://mp.example/pay' }) });
    await waitFor(() => expect(mockRedirigir).toHaveBeenCalledWith('https://mp.example/pay'));
  });

  test.each([
    ['HTTP 500', () => Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'x' }) })],
    ['red caída', () => Promise.reject(new Error('network'))],
    ['sin init_point', () => Promise.resolve({ ok: true, json: async () => ({}) })],
  ])('%s → alerta, sin redirección y permite reintentar', async (_caso, respuesta) => {
    mockFetch(respuesta());
    render(<PedidoPagoBoton pedidoId={UUID} />);
    fireEvent.click(boton());
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(mockRedirigir).not.toHaveBeenCalled();
    expect(boton()).not.toBeDisabled();
    fireEvent.click(boton());
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(2));
  });

  test('al montar no llama a la API ni navega', () => {
    mockFetch(Promise.resolve({ ok: true, json: async () => ({}) }));
    render(<PedidoPagoBoton pedidoId={UUID} />);
    expect(fetchMock()).not.toHaveBeenCalled();
    expect(mockRedirigir).not.toHaveBeenCalled();
  });
});
