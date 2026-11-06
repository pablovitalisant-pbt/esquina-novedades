const sqlMock = jest.fn();
jest.mock('@/lib/db', () => ({ sql: (...args: unknown[]) => sqlMock(...args) }));

import { registrarPagoApp } from '@/lib/pagos-app/registro';

const UUID = '11111111-1111-4111-8111-111111111111';

const pago = () => ({
  clave: UUID,
  fecha: '2026-10-01',
  medio: 'transferencia' as const,
  monto_clp: 60000,
  detalle: 'Abono inicial',
});

const persistido = (over: Record<string, unknown> = {}) => ({
  id: 'pago-1',
  ...pago(),
  reversa_de: null,
  ...over,
});

const texto = (args: unknown[]) => (args[0] as string[]).join(' ');

function preparar(insertadas: unknown[], existente?: Record<string, unknown>) {
  sqlMock.mockImplementation((...args: unknown[]) =>
    Promise.resolve(/INSERT/i.test(texto(args)) ? insertadas : existente ? [existente] : []),
  );
}

beforeEach(() => jest.clearAllMocks());

describe('registrarPagoApp', () => {
  it('inserta un asiento nuevo y devuelve su id', async () => {
    preparar([{ id: 'pago-1' }]);
    await expect(registrarPagoApp(pago())).resolves.toEqual({ id: 'pago-1', nuevo: true });
  });

  it('reintento con misma clave y mismos datos devuelve el id sin duplicar', async () => {
    preparar([], persistido());
    await expect(registrarPagoApp(pago())).resolves.toEqual({ id: 'pago-1', nuevo: false });
  });

  it('misma clave con datos distintos lanza y no devuelve id', async () => {
    preparar([], persistido({ monto_clp: 50000 }));
    await expect(registrarPagoApp(pago())).rejects.toThrow();
  });
});
