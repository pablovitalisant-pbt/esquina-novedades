/**
 * Fixtures mínimas para la rama Neon `test-integration` (Slice A6).
 * Uso: npm run test:seed
 *
 * Idempotente: se puede correr N veces sin duplicar filas.
 * Nunca apunta a producción: carga .env.test y aborta vía assertNoProduccion.
 */
import { existsSync } from 'fs';
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { assertNoProduccion, assertEnvTestExiste } from '../lib/test-safeguards';

config({ path: '.env.test', override: true });
assertEnvTestExiste(existsSync('.env.test'));
assertNoProduccion(process.env.DATABASE_URL || '');

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const empresa = await sql`SELECT id FROM public.empresas ORDER BY id LIMIT 1`;
  if (empresa.length === 0) throw new Error('No hay empresas en la rama de test');
  const empresaId = empresa[0].id;

  const usuario = await sql`SELECT id FROM public.usuarios ORDER BY id LIMIT 1`;
  if (usuario.length === 0) throw new Error('No hay usuarios en la rama de test');
  const userId = usuario[0].id;

  await sql`
    INSERT INTO public.catalogos (empresa_id, user_id, titulo, slug, activo)
    SELECT ${empresaId}, ${userId}, 'Seed test-integration', 'seed-test-integration', true
    WHERE NOT EXISTS (SELECT 1 FROM public.catalogos WHERE slug = 'seed-test-integration')
  `;
  // El test lee `empresa_id FROM catalogos LIMIT 1`: garantizar que no sea null.
  await sql`UPDATE public.catalogos SET empresa_id = ${empresaId} WHERE empresa_id IS NULL`;

  await sql`
    INSERT INTO public.clientes (nombre)
    SELECT 'Cliente semilla test-integration'
    WHERE NOT EXISTS (SELECT 1 FROM public.clientes)
  `;

  await sql`
    INSERT INTO public.caja_cuentas (id, nombre, moneda, activa, orden)
    VALUES (1, 'Caja semilla test-integration', 'CLP', true, 0)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    SELECT setval(
      'public.caja_cuentas_id_seq',
      GREATEST((SELECT MAX(id) FROM public.caja_cuentas), 1),
      true
    )
  `;

  for (const tabla of ['catalogos', 'clientes', 'caja_cuentas']) {
    const r = await sql.query(`SELECT count(*)::int AS n FROM public.${tabla}`);
    console.log(`${tabla}: ${r[0].n}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
