/**
 * BUG-034 — Aislar el entorno de test de la base de datos.
 *
 * Corre en `setupFiles` (antes de que se evalúe lib/db.ts). Carga `.env.test`
 * (rama Neon `test-integration`) con override para que gane sobre `.env.local`
 * que next/jest carga por defecto. Si por cualquier motivo el DATABASE_URL queda
 * apuntando a la rama de PRODUCCIÓN (`ep-blue-truth-accio1kb`), aborta la suite
 * con un error explícito ANTES de ejecutar un solo test.
 */
require('dotenv').config({ path: '.env.test', override: true });

// BUG-034 + BUG-064: aborta si DATABASE_URL apunta a cualquier host de producción.
import { assertNoProduccion } from './lib/test-safeguards';
assertNoProduccion(process.env.DATABASE_URL || '');
