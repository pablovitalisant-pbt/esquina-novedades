const sqlMock = jest.fn();
jest.mock('@/lib/db', () => ({ sql: (...args: unknown[]) => sqlMock(...args) }));

import { leerResumenPagosApp } from '@/lib/pagos-app/resumen';

const fila = (over: Record<string, unknown> = {}) => ({
  id: 'pago-1',
  fecha: '2026-10-01',
  medio: 'transferencia',
  monto_clp: 60000,
  detalle: 'Abono inicial',
  reversa_de: null as string | null,
  tiene_comprobante: true,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.PAGOS_APP_TOTAL_CLP = '100000';
});

afterEach(() => {
  delete process.env.PAGOS_APP_TOTAL_CLP;
});

describe('leerResumenPagosApp', () => {
  it('lista asientos y calcula abonado, saldo y progreso', async () => {
    const pagos = [
      fila(),
      fila({ id: 'reversa-1', monto_clp: 10000, detalle: 'Reversión', reversa_de: 'pago-1' }),
    ];
    sqlMock.mockResolvedValue(pagos);

    const resumen = await leerResumenPagosApp();

    expect(resumen).toMatchObject({ total: 100000, abonado: 50000, saldo: 50000, progreso: 50 });
    expect(resumen?.pagos).toEqual(pagos);
  });

  it('trata la reversa como resta y el sobrepago como progreso 100 con saldo 0', async () => {
    sqlMock.mockResolvedValue([fila({ monto_clp: 150000 })]);

    await expect(leerResumenPagosApp()).resolves.toMatchObject({
      abonado: 150000,
      saldo: 0,
      progreso: 100,
    });
  });

  it('devuelve null sin consultar la base si el total es inválido', async () => {
    delete process.env.PAGOS_APP_TOTAL_CLP;
    await expect(leerResumenPagosApp()).resolves.toBeNull();

    for (const invalido of ['0', '-5', 'abc', '10.5']) {
      process.env.PAGOS_APP_TOTAL_CLP = invalido;
      await expect(leerResumenPagosApp()).resolves.toBeNull();
    }

    expect(sqlMock).not.toHaveBeenCalled();
  });
});
