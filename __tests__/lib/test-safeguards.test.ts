/**
 * Fase B — Slice safeguard anti-producción (BUG-034 + BUG-064).
 * Función pura assertNoProduccion: debe abortar si DATABASE_URL apunta a
 * CUALQUIER host de producción (viejo/frozen ep-blue-truth-accio1kb y el activo
 * ep-rough-breeze-ac1t8o79) y NO abortar con el host de test-integration.
 */

import { assertNoProduccion, assertEnvTestExiste } from '@/lib/test-safeguards';

const PROD_VIEJO = 'postgres://u:p@ep-blue-truth-accio1kb-pooler.sa-east-1.aws.neon.tech/db';
const PROD_ACTIVO = 'postgres://u:p@ep-rough-breeze-ac1t8o79-pooler.sa-east-1.aws.neon.tech/db';
const TEST_INTEGRATION = 'postgres://u:p@ep-calm-boat-ac51kbaz-pooler.sa-east-1.aws.neon.tech/db';

describe('assertNoProduccion — safeguard anti-producción (BUG-034 + BUG-064)', () => {
  // El error real dice "PRODUCCIÓN" (con tilde). `/produccion/i` NO matchea la Ó
  // (case-insensitive no normaliza acentos). Se usa /SAFEGUARD BUG-034/i, estable
  // y sin depender del texto exacto del mensaje.
  it('host de producción VIEJO (ep-blue-truth-accio1kb) → tira error', () => {
    expect(() => assertNoProduccion(PROD_VIEJO)).toThrow(/SAFEGUARD BUG-034/i);
  });

  it('host de producción ACTIVO (ep-rough-breeze-ac1t8o79) → tira error (BUG-064)', () => {
    expect(() => assertNoProduccion(PROD_ACTIVO)).toThrow(/SAFEGUARD BUG-034/i);
  });

  it('host de producción La Esquina (ep-proud-hall-b6nxrz4m) → tira error (BUG-001)', () => {
    const url = 'postgres://u:p@ep-proud-hall-b6nxrz4m-pooler.sa-east-1.aws.neon.tech/db';
    expect(() => assertNoProduccion(url)).toThrow(/SAFEGUARD BUG-034/i);
  });

  it('host de test-integration (ep-calm-boat-ac51kbaz) → NO tira error', () => {
    expect(() => assertNoProduccion(TEST_INTEGRATION)).not.toThrow();
  });
});

describe('assertEnvTestExiste (BUG-001)', () => {
  it('sin .env.test → aborta (no cae en .env.local)', () => {
    expect(() => assertEnvTestExiste(false)).toThrow(/\.env\.test/);
  });

  it('con .env.test → no tira', () => {
    expect(() => assertEnvTestExiste(true)).not.toThrow();
  });
});
