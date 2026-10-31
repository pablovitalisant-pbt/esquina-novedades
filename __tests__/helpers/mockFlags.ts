/**
 * A19: factory para `jest.mock('@/config/feature-flags.json', ...)`.
 * Devuelve el JSON real con los overrides del test encima, así un flag nuevo
 * del JSON llega a la suite sin tocarla (BUG-004).
 *
 * Uso: jest.mock('@/config/feature-flags.json',
 *   () => require('@/__tests__/helpers/mockFlags').mockFlags({ 'flag-x': false }));
 */
export function mockFlags(
  overrides: Record<string, boolean> = {}
): Record<string, boolean> {
  const real = jest.requireActual<Record<string, boolean>>(
    '@/config/feature-flags.json'
  );
  return { ...real, ...overrides };
}
