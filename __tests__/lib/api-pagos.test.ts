/**
 * Fase B — A17: helpers compartidos de cobro (lib/api-pagos).
 * Red de seguridad de los dialogos: mismo payload, mismos errores.
 */
import { cargarCuentasActivas, ErrorPago, pagarNota } from '@/lib/api-pagos';

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const originalFetch = global.fetch;

/** Asigna un fetch mockeado para el test en curso. */
function setFetch(impl: (url: string, init?: { body?: string }) => Promise<unknown>) {
  const fn = jest.fn(impl);
  global.fetch = fn as any;
  return fn;
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe('cargarCuentasActivas', () => {
  it('pide las cuentas activas y devuelve data', async () => {
    const cuentas = [{ id: 1, nombre: 'Caja', activa: true, orden: 1 }];
    const fetchMock = setFetch(async () => json({ data: cuentas }));

    await expect(cargarCuentasActivas()).resolves.toEqual(cuentas);
    expect(fetchMock).toHaveBeenCalledWith('/api/caja/cuentas?activas=true');
  });

  it('sin data devuelve lista vacia', async () => {
    setFetch(async () => json({}));
    await expect(cargarCuentasActivas()).resolves.toEqual([]);
  });

  it('con soloSiOk descarta el body de una respuesta no-ok', async () => {
    setFetch(async () => json({ data: [{ id: 9 }] }, 500));
    await expect(cargarCuentasActivas({ soloSiOk: true })).resolves.toEqual([]);
  });

  it('propaga el error de red', async () => {
    setFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(cargarCuentasActivas()).rejects.toThrow('Failed to fetch');
  });
});

describe('pagarNota', () => {
  it('envia el payload exacto al endpoint indicado', async () => {
    const fetchMock = setFetch(async () => json({ monto_aplicado: 1000 }));
    const payload = { cuenta_id: 2, monto: 1000, forma_pago: 'efectivo', observaciones: '' };

    await pagarNota(7, payload);

    expect(fetchMock).toHaveBeenCalledWith('/api/notas-venta/7/pagar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect((fetchMock.mock.calls[0][1] as { body: string }).body).toBe(
      '{"cuenta_id":2,"monto":1000,"forma_pago":"efectivo","observaciones":""}'
    );
  });

  it('devuelve el body de exito', async () => {
    setFetch(async () => json({ monto_aplicado: 5000, saldo_pendiente_restante: 0 }));
    await expect(
      pagarNota(7, { cuenta_id: 1, monto: 5000, forma_pago: 'efectivo' })
    ).resolves.toEqual({ monto_aplicado: 5000, saldo_pendiente_restante: 0 });
  });

  it('error HTTP: lanza ErrorPago con el mensaje del servidor', async () => {
    setFetch(async () => json({ error: 'Saldo insuficiente' }, 409));

    const err = await pagarNota(7, { cuenta_id: 1, monto: 1, forma_pago: 'efectivo' }).catch(e => e);
    expect(err).toBeInstanceOf(ErrorPago);
    expect(err.message).toBe('Saldo insuficiente');
  });

  it('error HTTP sin mensaje: ErrorPago con message vacio', async () => {
    setFetch(async () => json({}, 500));
    const err = await pagarNota(7, { cuenta_id: 1, monto: 1, forma_pago: 'efectivo' }).catch(e => e);
    expect(err).toBeInstanceOf(ErrorPago);
    expect(err.message).toBe('');
  });

  it('error de red: propaga el error original (no ErrorPago)', async () => {
    setFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await pagarNota(7, { cuenta_id: 1, monto: 1, forma_pago: 'efectivo' }).catch(e => e);
    expect(err).not.toBeInstanceOf(ErrorPago);
    expect(err).toBeInstanceOf(TypeError);
  });
});
