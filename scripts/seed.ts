import { neon } from '@neondatabase/serverless';
import { runSeed } from './seed-core';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL no está definida (.env.local).');
  process.exit(1);
}

runSeed(neon(process.env.DATABASE_URL), process.env)
  .then(() => console.log('Seed completado (empresa + admin).'))
  .catch((e) => {
    console.error('Error en seed:', e.message);
    process.exit(1);
  });
