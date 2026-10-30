/**
 * @jest-environment jsdom
 *
 * Fase B — pos3b: panel COBRAR.
 * Riesgos: doble submit, monto > saldo con tarjeta, parcial, vuelto, teclas
 * 1-4 vs monto, cuenta predeterminada por usuario.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PosCobrarDialog } from '@/components/PosCobrarDialog';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const CUENTAS = [{ id: 1, nombre: 'Caja', activa: true, orden: 1 }, { id: 2, nombre: 'Banco', activa: true, orden: 2 }];

function servidor(pagar: () => Promise<unknown> = async () => json({ monto_aplicado: 10000, saldo_pendiente_restante: 0 })) {
  const state = { pagos: [] as Record<string, unknown>[] };
  const fetchMock = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
    if (url === '/api/caja/cuentas?activas=true') return json({ data: CUENTAS });
    if (url.endsWith('/pagar') && init?.method === 'POST') {
      state.pagos.push(JSON.parse(init.body ?? '{}'));
      return pagar();
    }
    return json({ error: 'no mockeado' }, 500);
  });
  global.fetch = fetchMock as any;
  return state;
}

function montar(props: Partial<React.ComponentProps<typeof PosCobrarDialog>> = {}) {
  const onOpenChange = jest.fn();
  const onNuevaVenta = jest.fn();
  render(
    <PosCobrarDialog
      open
      onOpenChange={onOpenChange}
      notaId="9"
      saldoPendiente={10000}
      usuarioId="7"
      onNuevaVenta={onNuevaVenta}
      {...props}
    />
  );
  return { onOpenChange, onNuevaVenta };
}

const montoInput = () => screen.getByTestId('pos-monto') as HTMLInputElement;
const cuentaInput = () => screen.getByTestId('pos-cuenta') as HTMLSelectElement;
const cuentasListas = (v = '1') => waitFor(() => expect(cuentaInput().value).toBe(v));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('pos3 — COBRAR: montos y formas de pago', () => {
  it('precarga el saldo, efectivo por defecto y la primera cuenta activa', async () => {
    servidor();
    montar();
    await waitFor(() => expect(montoInput().value).toBe('10000'));
    expect(screen.getByTestId('pos-forma-efectivo')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect((screen.getByTestId('pos-cuenta') as HTMLSelectElement).value).toBe('1'));
  });

  it('efectivo con monto > saldo: muestra vuelto y registra solo el saldo', async () => {
    const state = servidor();
    montar();
    await waitFor(() => expect(montoInput().value).toBe('10000'));
    await cuentasListas();
    fireEvent.change(montoInput(), { target: { value: '12000' } });
    expect(screen.getByTestId('pos-vuelto')).toHaveTextContent('2.000');

    fireEvent.click(screen.getByTestId('pos-confirmar'));
    await waitFor(() => expect(state.pagos).toHaveLength(1));
    expect(state.pagos[0]).toEqual({ cuenta_id: 1, monto: 10000, forma_pago: 'efectivo' });
    await waitFor(() => expect(screen.getByTestId('pos-vuelto')).toHaveTextContent('2.000'));
  });

  it('tarjeta con monto > saldo: NO se confirma y avisa', async () => {
    const state = servidor();
    montar();
    await waitFor(() => expect(montoInput().value).toBe('10000'));
    await cuentasListas();
    fireEvent.click(screen.getByTestId('pos-forma-tarjeta'));
    fireEvent.change(montoInput(), { target: { value: '12000' } });
    fireEvent.click(screen.getByTestId('pos-confirmar'));

    expect(await screen.findByRole('alert')).toHaveTextContent('no puede superar el saldo');
    expect(state.pagos).toHaveLength(0);
  });

  it('pago parcial: confirma y muestra "Queda debiendo"', async () => {
    const state = servidor(async () => json({ monto_aplicado: 4000, saldo_pendiente_restante: 6000 }));
    montar();
    await waitFor(() => expect(montoInput().value).toBe('10000'));
    await cuentasListas();
    fireEvent.change(montoInput(), { target: { value: '4000' } });
    fireEvent.click(screen.getByTestId('pos-forma-transferencia'));
    fireEvent.click(screen.getByTestId('pos-confirmar'));

    await waitFor(() => expect(state.pagos[0]).toEqual({ cuenta_id: 1, monto: 4000, forma_pago: 'transferencia' }));
    const debe = await screen.findByTestId('pos-queda-debiendo');
    expect(debe).toHaveTextContent('Queda debiendo');
    expect(debe).toHaveTextContent('6.000');
  });

  it('teclas 1-4 cambian forma SOLO con el foco fuera del monto', async () => {
    servidor();
    montar();
    await waitFor(() => expect(montoInput().value).toBe('10000'));

    fireEvent.keyDown(montoInput(), { key: '2' });
    expect(screen.getByTestId('pos-forma-efectivo')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(document.body, { key: '3' });
    expect(screen.getByTestId('pos-forma-transferencia')).toHaveAttribute('aria-pressed', 'true');
  });

  it('bloquea doble submit mientras el pago está en vuelo', async () => {
    let resolver: (v: unknown) => void = () => {};
    const state = servidor(() => new Promise(r => { resolver = r; }));
    montar();
    await waitFor(() => expect(montoInput().value).toBe('10000'));
    await cuentasListas();

    fireEvent.click(screen.getByTestId('pos-confirmar'));
    fireEvent.click(screen.getByTestId('pos-confirmar'));
    await waitFor(() => expect(state.pagos).toHaveLength(1));
    resolver(json({ monto_aplicado: 10000, saldo_pendiente_restante: 0 }));
    await screen.findByText('Cobro registrado');
    expect(state.pagos).toHaveLength(1);
  });
});

describe('pos3 — COBRAR: cuenta predeterminada y salida', () => {
  it('usa la cuenta predeterminada del usuario guardada en localStorage', async () => {
    localStorage.setItem('pos-cuenta-default-7', '2');
    servidor();
    montar();
    await waitFor(() => expect((screen.getByTestId('pos-cuenta') as HTMLSelectElement).value).toBe('2'));
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('"Usar como predeterminada" guarda la cuenta del usuario actual', async () => {
    servidor();
    montar();
    await waitFor(() => expect((screen.getByTestId('pos-cuenta') as HTMLSelectElement).value).toBe('1'));
    fireEvent.change(screen.getByTestId('pos-cuenta'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(localStorage.getItem('pos-cuenta-default-7')).toBe('2');
  });

  it('éxito: botones Imprimir/WhatsApp navegan a la nota con ?accion=', async () => {
    servidor();
    montar();
    await waitFor(() => expect(montoInput().value).toBe('10000'));
    await cuentasListas();
    fireEvent.click(screen.getByTestId('pos-confirmar'));
    await screen.findByText('Cobro registrado');

    fireEvent.click(screen.getByText('Imprimir PDF'));
    expect(push).toHaveBeenCalledWith('/notas-venta/9?accion=pdf');
  });

  it('éxito: Enter/Nueva venta resetea la venta', async () => {
    servidor();
    const { onNuevaVenta } = montar();
    await waitFor(() => expect(montoInput().value).toBe('10000'));
    await cuentasListas();
    fireEvent.click(screen.getByTestId('pos-confirmar'));
    await screen.findByText('Cobro registrado');

    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onNuevaVenta).toHaveBeenCalledTimes(1);
  });
});
