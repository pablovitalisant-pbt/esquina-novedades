import type { Session } from 'next-auth';
import flags from '@/config/feature-flags.json';

jest.mock('@/config/feature-flags.json', () =>
  require('@/__tests__/helpers/mockFlags').mockFlags({ 'pagos-app-privados': true })
);

import { rolPagosApp } from '@/lib/pagos-app/acceso';

const flag = flags as Record<string, boolean>;
const sesion = (id: string, rol = 'admin') =>
  ({ user: { id, rol } }) as unknown as Session;
const envOriginal = { ...process.env };

beforeEach(() => {
  flag['pagos-app-privados'] = true;
  process.env.PAGOS_APP_PABLO_ID = '101';
  process.env.PAGOS_APP_PAOLA_ID = '202';
});

afterEach(() => {
  process.env = { ...envOriginal };
});

describe('rolPagosApp', () => {
  it('devuelve pablo y paola para sus IDs admin', () => {
    expect(rolPagosApp(sesion('101'))).toBe('pablo');
    expect(rolPagosApp(sesion('202'))).toBe('paola');
  });

  it('rechaza terceros, sin sesión y roles no admin', () => {
    expect(rolPagosApp(sesion('999'))).toBeNull();
    expect(rolPagosApp(null)).toBeNull();
    expect(rolPagosApp(sesion('101', 'vendedor'))).toBeNull();
  });

  it('rechaza config incompleta, inválida o duplicada', () => {
    delete process.env.PAGOS_APP_PAOLA_ID;
    expect(rolPagosApp(sesion('101'))).toBeNull();

    process.env.PAGOS_APP_PAOLA_ID = '202';
    process.env.PAGOS_APP_PABLO_ID = '0';
    expect(rolPagosApp(sesion('0'))).toBeNull();

    process.env.PAGOS_APP_PABLO_ID = '202';
    expect(rolPagosApp(sesion('202'))).toBeNull();
  });

  it('rechaza todo con el flag apagado', () => {
    flag['pagos-app-privados'] = false;
    expect(rolPagosApp(sesion('101'))).toBeNull();
    expect(rolPagosApp(sesion('202'))).toBeNull();
  });
});
