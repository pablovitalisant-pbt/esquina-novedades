/** Fase B — N03c1: selector de medios de pago alternativos de la reserva. */
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { PedidoMediosPago } from '@/components/PedidoMediosPago';

jest.mock('@/components/PedidoPagoBoton', () => ({
  PedidoPagoBoton: () => <button>Pagar con Mercado Pago</button>,
}));

const ID = '6c1f0a2e-8b3d-4a5f-9c7e-1d2b3a4c5d6e';
const REF = '6C1F0A2E';
const DATOS = { banco: 'Banco Test', titular: 'Ana Pérez', rut: '11.111.111-1', tipo_cuenta: 'Cuenta Vista', numero_cuenta: '0000001', correo: 'pagostienda@example.com' };
const fetchMock = () => (global as any).fetch as jest.Mock;
const mock = (r: () => any) => { (global as any).fetch = jest.fn(r); };
const props = { pedidoId: ID, referencia: REF, permiteEfectivo: true, permiteTransferencia: true };
const boton = (n: RegExp) => screen.getByRole('button', { name: n });
const transferir = () => boton(/transferir|transferencia/i);
const efectivo = () => boton(/efectivo/i);
const mp = () => screen.queryByRole('button', { name: /pagar con mercado pago/i });

beforeEach(() => jest.clearAllMocks());

describe('PedidoMediosPago', () => {
  test('transferencia: POST /metodo, instrucciones y oculta alternativas', async () => {
    mock(() => Promise.resolve({ ok: true, json: async () => ({ metodo: 'transferencia', referencia: REF, datos_transferencia: DATOS }) }));
    render(<PedidoMediosPago {...props} />);
    fireEvent.click(transferir());
    await waitFor(() => expect(screen.getByText(DATOS.banco)).toBeInTheDocument());
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe(`/api/pedidos/${ID}/metodo`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ metodo: 'transferencia' });
    [DATOS.titular, DATOS.rut, DATOS.tipo_cuenta, DATOS.numero_cuenta, DATOS.correo].forEach((d) => expect(screen.getByText(d)).toBeInTheDocument());
    expect(screen.getAllByText(new RegExp(REF, 'i')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /efectivo/i })).not.toBeInTheDocument();
    expect(mp()).not.toBeInTheDocument();
  });

  test('efectivo: POST y aviso de pago al recibir', async () => {
    mock(() => Promise.resolve({ ok: true, json: async () => ({ metodo: 'efectivo', referencia: REF }) }));
    render(<PedidoMediosPago {...props} />);
    fireEvent.click(efectivo());
    await waitFor(() => expect(screen.getByText(/pag.*al recibir/i)).toBeInTheDocument());
    expect(JSON.parse(fetchMock().mock.calls[0][1].body)).toEqual({ metodo: 'efectivo' });
    expect(screen.queryByRole('button', { name: /transferir|transferencia/i })).not.toBeInTheDocument();
    expect(mp()).not.toBeInTheDocument();
  });

  test('doble clic durante la petición → un solo POST', () => {
    mock(() => new Promise(() => {}));
    render(<PedidoMediosPago {...props} />);
    fireEvent.click(transferir());
    fireEvent.click(transferir());
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  test('fallo de red → alerta accesible y reintento', async () => {
    mock(() => Promise.reject(new Error('red')));
    render(<PedidoMediosPago {...props} />);
    fireEvent.click(transferir());
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(transferir()).not.toBeDisabled();
    fireEvent.click(transferir());
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(2));
  });

  test('transferencia persistida al recargar → datos sin peticiones', () => {
    mock(() => Promise.resolve({ ok: true, json: async () => ({}) }));
    render(<PedidoMediosPago {...props} metodoInicial="transferencia" datosIniciales={DATOS} />);
    expect(screen.getByText(DATOS.banco)).toBeInTheDocument();
    expect(screen.getByText(DATOS.numero_cuenta)).toBeInTheDocument();
    expect(screen.getByText(DATOS.correo)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /efectivo/i })).not.toBeInTheDocument();
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});
