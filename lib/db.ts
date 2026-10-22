import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// We use the neon function to create a connection to the database.
// This is optimized for serverless environments.
// fetchOptions.cache: 'no-store' evita que Next.js cachee
// los fetches internos del driver HTTP de Neon en Vercel
export const sql = neon(process.env.DATABASE_URL, {
  fetchOptions: { cache: 'no-store' },
});
