/** Fase B — N04d2a: confirmación manual de cobro en administración. */
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { ConfirmarCobroPedido } from '@/components/ConfirmarCobroPedido';

const ID = '6c1f0a2e-8b3d-4a5f-9c7e-1d2b3a4c5d6e';
const MOV = '0b7e4c1a-2d3f-4a5b-8c9d-0e1f2a3b4c5d';
const CUENTAS = [
  { id: 1, nombre: 'Caja CLP', activa: true, moneda: 'CLP' },
  { id: 2, nombre: 'Caja USD', activa: true, moneda: 'USD' },
];
const ok = (body: any) => Promise.resolve({ ok: true, json: async () => body });
const fallo = () => Promise.resolve({ ok: false, json: async () => ({ error: 'fallo' }) });
const mockFetch = (post: () => Promise<any>) => {
  const fn = jest.fn((url: string) => String(url).startsWith('/api/caja/cuentas') ? ok({ data: CUENTAS }) : post());
  (global as any).fetch = fn;
  return fn;
};
const props = (extra: object = {}) => ({ pedidoId: ID, monto: 12500, metodo: 'transferencia' as const, onConfirmado: jest.fn(), ...extra });
const abrir = async (extra: object = {}) => {
  const p = props(extra);
  render(<ConfirmarCobroPedido {...p} />);
  fireEvent.click(screen.getByRole('button', { name: /confirmar cobro/i }));
  if (!('confirmacion' in extra)) await screen.findByText('Caja CLP');
  return p;
};
const cuenta = () => screen.getByLabelText(/cuenta de caja/i);
const referencia = () => screen.getByLabelText(/referencia de transferencia/i);
const registrar = () => screen.getByRole('button', { name: /registrar cobro/i });
const posts = (fn: jest.Mock) => fn.mock.calls.filter(([u]) => String(u).includes('/confirmar-pago'));

beforeEach(() => jest.clearAllMocks());
describe('ConfirmarCobroPedido', () => {
  test('consulta cuentas activas y solo muestra las CLP', async () => {
    const fn = mockFetch(() => ok({}));
    await abrir();
    expect(fn).toHaveBeenCalledWith('/api/caja/cuentas?activas=true');
    expect(screen.getByText('Caja CLP')).toBeInTheDocument();
    expect(screen.queryByText('Caja USD')).not.toBeInTheDocument();
  });

  test('transferencia exige referencia antes de llamar al endpoint', async () => {
    const fn = mockFetch(() => ok({ caja_movimiento_id: MOV }));
    await abrir();
    fireEvent.change(cuenta(), { target: { value: '1' } });
    fireEvent.click(registrar());
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(posts(fn)).toHaveLength(0);
  });

  test('error y reintento: un solo POST por clic y alerta', async () => {
    const fn = mockFetch(fallo);
    await abrir();
    fireEvent.change(cuenta(), { target: { value: '1' } });
    fireEvent.change(referencia(), { target: { value: 'REF-1' } });
    const boton = registrar();
    fireEvent.click(boton);
    expect(boton).toBeDisabled();
    fireEvent.click(boton);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(posts(fn)).toHaveLength(1);
    expect(boton).not.toBeDisabled();
    fireEvent.click(boton);
    await waitFor(() => expect(posts(fn)).toHaveLength(2));
    expect(fn.mock.calls.filter(([u]) => String(u).startsWith('/api/caja/cuentas'))).toHaveLength(1);
  });

  test('solo declara completado cuando existe caja_movimiento_id', async () => {
    const respuestas = [ok({ id: 9, estado: 'pagado' }), ok({ id: 9, estado: 'pagado', caja_movimiento_id: MOV })];
    const fn = mockFetch(() => respuestas.shift()!);
    const p = await abrir();
    fireEvent.change(cuenta(), { target: { value: '1' } });
    fireEvent.change(referencia(), { target: { value: 'REF-1' } });
    fireEvent.click(registrar());
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(p.onConfirmado).not.toHaveBeenCalled();
    fireEvent.click(registrar());
    await waitFor(() => expect(p.onConfirmado).toHaveBeenCalled());
    const [url, init] = posts(fn)[0];
    expect(url).toBe(`/api/pedidos/${ID}/confirmar-pago`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ cuenta_id: 1, monto: 12500, referencia: 'REF-1' });
  });

  test('confirmación previa reutiliza cuenta y referencia sin volver a pedirlas', async () => {
    const fn = mockFetch(() => ok({ caja_movimiento_id: MOV }));
    const p = await abrir({ confirmacion: { cuenta_id: 1, referencia: 'REF-1' } });
    expect(screen.queryByLabelText(/cuenta de caja/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/referencia de transferencia/i)).not.toBeInTheDocument();
    fireEvent.click(registrar());
    await waitFor(() => expect(p.onConfirmado).toHaveBeenCalled());
    expect(JSON.parse(posts(fn)[0][1].body)).toEqual({ cuenta_id: 1, monto: 12500, referencia: 'REF-1' });
  });
});
