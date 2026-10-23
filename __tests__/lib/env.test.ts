/**
 * @jest-environment node
 *
 * Fase B — A3: validación de variables de entorno.
 * Los flags se mockean explícitamente (lección BUG-004): nunca leer el JSON real.
 */
jest.mock('@/config/feature-flags.json', () => ({ 'tienda-pago-online': false }));

import flags from '@/config/feature-flags.json';
import {
  REQUERIDAS,
  REQUERIDAS_PAGO,
  OPCIONALES,
  revisarEntorno,
  validarEntorno,
} from '@/lib/env';

const setPagoOnline = (v: boolean) => {
  (flags as any)['tienda-pago-online'] = v;
};

const TODAS = [
  ...REQUERIDAS,
  ...REQUERIDAS_PAGO,
  ...OPCIONALES,
] as string[];

function entornoCompleto(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const nombre of TODAS) env[nombre] = `valor-de-${nombre}`;
  return env;
}

function logMock() {
  return { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
}

afterEach(() => setPagoOnline(false));

describe('revisarEntorno', () => {
  test('1. una requerida ausente aparece en faltantes', () => {
    const env = entornoCompleto();
    delete env.DATABASE_URL;

    const r = revisarEntorno(env, false);

    expect(r.faltantes).toContain('DATABASE_URL');
  });

  test("2. un valor de solo espacios cuenta como faltante", () => {
    const env = entornoCompleto();
    env.NEXTAUTH_URL = '   ';

    const r = revisarEntorno(env, false);

    expect(r.faltantes).toContain('NEXTAUTH_URL');
  });

  test('3. pagoOnline=false no exige las de pago; true sí', () => {
    const env = entornoCompleto();
    delete env.MP_ACCESS_TOKEN;
    delete env.MP_WEBHOOK_SECRET;

    const sinPago = revisarEntorno(env, false);
    expect(sinPago.faltantes).toEqual([]);

    const conPago = revisarEntorno(env, true);
    expect(conPago.faltantes).toEqual(expect.arrayContaining([...REQUERIDAS_PAGO]));
  });

  test('4. todo presente → sin faltantes y log.error no se llama', () => {
    const log = logMock();

    const r = validarEntorno(entornoCompleto(), log);

    expect(r.faltantes).toEqual([]);
    expect(r.opcionalesFaltantes).toEqual([]);
    expect(log.error).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  test('5. el mensaje nombra la variable faltante y NUNCA imprime valores', () => {
    const CENTINELA = 'VALOR-CENTINELA-12345';
    const env = entornoCompleto();
    env.DATABASE_URL = CENTINELA;
    delete env.NEXTAUTH_SECRET;
    const log = logMock();

    validarEntorno(env, log);

    expect(log.error).toHaveBeenCalledTimes(1);
    const mensaje = String(log.error.mock.calls[0][0]);
    expect(mensaje).toContain('NEXTAUTH_SECRET');
    expect(mensaje).not.toContain(CENTINELA);
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(CENTINELA);
  });

  test('6. opcional faltante → log.warn, nunca log.error', () => {
    const env = entornoCompleto();
    delete env.CLOUDINARY_CLOUD_NAME;
    const log = logMock();

    const r = validarEntorno(env, log);

    expect(r.faltantes).toEqual([]);
    expect(r.opcionalesFaltantes).toContain('CLOUDINARY_CLOUD_NAME');
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.error).not.toHaveBeenCalled();
  });

  test('validarEntorno lee el flag tienda-pago-online para exigir las de pago', () => {
    const env = entornoCompleto();
    delete env.MP_ACCESS_TOKEN;
    delete env.MP_WEBHOOK_SECRET;
    const log = logMock();

    setPagoOnline(false);
    expect(validarEntorno(env, log).faltantes).toEqual([]);

    setPagoOnline(true);
    expect(validarEntorno(env, log).faltantes).toEqual(
      expect.arrayContaining([...REQUERIDAS_PAGO]),
    );
  });
});
