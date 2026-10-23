/**
 * @jest-environment node
 *
 * Fase B — A3: register() solo valida entorno en runtime nodejs y con el flag on.
 * Flags mockeados explícitamente (lección BUG-004).
 */
jest.mock('@/config/feature-flags.json', () => ({
  'tienda-pago-online': false,
  'env-validacion-arranque': true,
}));
jest.mock('@/lib/env', () => ({
  validarEntorno: jest.fn(() => ({ faltantes: [], opcionalesFaltantes: [] })),
}));

import flags from '@/config/feature-flags.json';
import { validarEntorno } from '@/lib/env';
import { register } from '@/instrumentation';

const validarMock = validarEntorno as jest.Mock;
const flagMock = flags as any;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_RUNTIME = 'nodejs';
  flagMock['env-validacion-arranque'] = true;
});

afterEach(() => {
  delete process.env.NEXT_RUNTIME;
});

test("7. NEXT_RUNTIME='edge' → no valida", async () => {
  process.env.NEXT_RUNTIME = 'edge';

  await register();

  expect(validarMock).not.toHaveBeenCalled();
});

test('8. flag env-validacion-arranque=false → no valida', async () => {
  flagMock['env-validacion-arranque'] = false;

  await register();

  expect(validarMock).not.toHaveBeenCalled();
});

test('9. nodejs + flag true → llama validarEntorno', async () => {
  await register();

  expect(validarMock).toHaveBeenCalledTimes(1);
});
