import flags from '@/config/feature-flags.json';

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!(flags as Record<string, unknown>)['env-validacion-arranque']) return;

  const { validarEntorno } = await import('./lib/env');
  validarEntorno();
}
