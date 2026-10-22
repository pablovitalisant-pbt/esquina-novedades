/**
 * Safeguard anti-producción de los tests de integración (BUG-034 + BUG-064).
 *
 * Función pura: aborta si el DATABASE_URL apunta a CUALQUIER host de producción.
 * Cubre el host viejo/frozen (ep-blue-truth-accio1kb, BUG-034) y el host de
 * producción ACTIVO desde la migración de proyecto (ep-rough-breeze-ac1t8o79,
 * BUG-064). Extraída de jest.env-setup.ts para poder testearla de forma aislada.
 */
export function assertNoProduccion(databaseUrl: string): void {
  const PROD_HOSTS = ['ep-blue-truth-accio1kb', 'ep-rough-breeze-ac1t8o79'];
  if (PROD_HOSTS.some((host) => databaseUrl.includes(host))) {
    throw new Error(
      'SAFEGUARD BUG-034: DATABASE_URL apunta a la rama de PRODUCCIÓN ' +
        '(ep-blue-truth-accio1kb / ep-rough-breeze-ac1t8o79) mientras NODE_ENV=test. ' +
        'Los tests de integración no deben correr contra producción. Verificá que ' +
        '.env.test exista y apunte a la rama test-integration.'
    );
  }
}
