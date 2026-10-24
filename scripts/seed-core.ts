import * as bcrypt from 'bcryptjs';
import type { NeonQueryFunction } from '@neondatabase/serverless';

export const EMPRESA_NOMBRE = 'La Esquina de las Novedades';
export const EMPRESA_SLUG = 'la-esquina-de-las-novedades';

export function validateSeedEnv(env: Record<string, string | undefined>) {
  const get = (k: string) => {
    const v = env[k]?.trim();
    if (!v) throw new Error(`Falta la variable de entorno ${k}`);
    return v;
  };
  const adminPassword = get('ADMIN_PASSWORD');
  if (adminPassword.length < 10) throw new Error('ADMIN_PASSWORD debe tener al menos 10 caracteres');
  return { adminRut: get('ADMIN_RUT'), adminNombre: get('ADMIN_NOMBRE'), adminPassword };
}

// Seed mínimo e idempotente: empresa + admin. El código asume empresa_id = 1.
export async function runSeed(
  sql: NeonQueryFunction<false, false>,
  env: Record<string, string | undefined>,
  hash: (p: string) => Promise<string> = (p) => bcrypt.hash(p, 10),
) {
  const { adminRut, adminNombre, adminPassword } = validateSeedEnv(env);

  await sql`
    INSERT INTO empresas (nombre, slug) VALUES (${EMPRESA_NOMBRE}, ${EMPRESA_SLUG})
    ON CONFLICT (slug) DO NOTHING
  `;
  const empresas = await sql`SELECT id, slug FROM empresas WHERE slug = ${EMPRESA_SLUG}`;
  const empresa = empresas.find((e) => e.slug === EMPRESA_SLUG);
  if (!empresa || empresa.id !== 1) {
    throw new Error('empresa debe quedar con id=1 (el código lo asume); la DB no está vacía');
  }

  const passwordHash = await hash(adminPassword);
  await sql`
    INSERT INTO usuarios (rut, nombre, rol, password) VALUES (${adminRut}, ${adminNombre}, 'admin', ${passwordHash})
    ON CONFLICT (rut) DO NOTHING
  `;
  const usuarios = await sql`SELECT id, rut FROM usuarios WHERE rut = ${adminRut}`;
  const admin = usuarios.find((u) => u.rut === adminRut);

  await sql`
    INSERT INTO usuario_empresa (usuario_id, empresa_id) VALUES (${admin!.id}, ${empresa.id})
    ON CONFLICT (usuario_id, empresa_id) DO NOTHING
  `;
}
