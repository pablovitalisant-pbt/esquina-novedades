import fs from 'fs';
import path from 'path';
import { Pool } from '@neondatabase/serverless';
import { MIGRATION_ORDER } from './migrations-order';

type Opts = {
  files: string[];
  readFile: (f: string) => string;
  exec: (sql: string) => Promise<unknown>;
  log: (line: string) => void;
};

// Aplica en orden y se detiene en el primer error. Loguea solo nombres de archivo.
export async function applyMigrations({ files, readFile, exec, log }: Opts) {
  const applied: string[] = [];
  for (const file of files) {
    try {
      await exec(readFile(file));
      applied.push(file);
      log(`OK    ${file}`);
    } catch (e) {
      log(`ERROR ${file}: ${(e as Error).message}`);
      return { applied, failed: { file, error: e as Error } };
    }
  }
  return { applied, failed: null };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL no está definida.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const dir = path.join(__dirname, '..', 'migrations');
  const { applied, failed } = await applyMigrations({
    files: MIGRATION_ORDER,
    readFile: (f) => fs.readFileSync(path.join(dir, f), 'utf8'),
    exec: (s) => pool.query(s),
    log: console.log,
  });
  await pool.end();
  console.log(`Aplicadas: ${applied.length}/${MIGRATION_ORDER.length}`);
  if (failed) process.exit(1);
}

if (process.argv[1]?.endsWith('apply-migrations.ts')) main();
