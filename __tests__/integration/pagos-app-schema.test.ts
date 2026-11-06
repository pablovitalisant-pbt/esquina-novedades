/** @jest-environment node */
/**
 * N12a1 Fase B — esquema pagos_app contra Postgres TEST (rama test-integration).
 * Pool directo con guard de host EXACTO; cada caso corre en BEGIN/ROLLBACK, así
 * que no persiste filas ni requiere DELETE. Espera en ROJO hasta aplicar 051:
 * insert válido, clave duplicada, monto inválido, reversas válida/inválida y
 * UPDATE/DELETE abortados por trigger. Sin datos reales.
 */
import { Pool, type PoolClient } from '@neondatabase/serverless';

const HOST_TEST = 'ep-polished-union-b66ujjc5-pooler.c-2.sa-east-1.aws.neon.tech';
const url = process.env.DATABASE_URL ?? '';
if (new URL(url).hostname !== HOST_TEST) {
  throw new Error(`N12a1: DATABASE_URL no es el host TEST exacto (${HOST_TEST})`);
}
const pool = new Pool({ connectionString: url });

async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    return await fn(c);
  } finally {
    await c.query('ROLLBACK').catch(() => undefined);
    c.release();
  }
}

type Pago = { clave?: string; medio?: string; monto: number; detalle?: string; reversa_de?: string | null };

const insertar = (c: PoolClient, p: Pago) =>
  c.query(
    `INSERT INTO pagos_app (clave, fecha, medio, monto_clp, detalle, reversa_de)
     VALUES ($1, '2026-11-06', $2, $3, $4, $5)
     RETURNING id, clave, medio, monto_clp, detalle, reversa_de`,
    [p.clave ?? crypto.randomUUID(), p.medio ?? 'transferencia', p.monto, p.detalle ?? 'prueba', p.reversa_de ?? null],
  );

afterAll(() => pool.end());

test('insert válido devuelve el asiento', async () => {
  const fila = await tx(async (c) => (await insertar(c, { monto: 5000 })).rows[0]);
  expect(fila.monto_clp).toBe(5000);
  expect(fila.medio).toBe('transferencia');
  expect(fila.reversa_de).toBeNull();
});

test('clave de idempotencia duplicada se rechaza', async () => {
  const clave = crypto.randomUUID();
  await tx(async (c) => {
    await insertar(c, { clave, monto: 1000 });
    await expect(insertar(c, { clave, monto: 1000 })).rejects.toThrow();
  });
});

test('monto_clp inválido (0 y negativo) se rechaza', async () => {
  await tx(async (c) => {
    await expect(insertar(c, { monto: 0 })).rejects.toThrow();
  });
  await tx(async (c) => {
    await expect(insertar(c, { monto: -1 })).rejects.toThrow();
  });
});

test('reversa válida: mismo monto y medio, apunta a la original', async () => {
  const fila = await tx(async (c) => {
    const original = (await insertar(c, { monto: 7000 })).rows[0];
    const reversa = (await insertar(c, { monto: 7000, reversa_de: original.id })).rows[0];
    return { original, reversa };
  });
  expect(fila.reversa.reversa_de).toBe(fila.original.id);
  expect(fila.reversa.monto_clp).toBe(fila.original.monto_clp);
});

test('reversa inválida: monto distinto de la original se rechaza', async () => {
  await tx(async (c) => {
    const original = (await insertar(c, { monto: 7000 })).rows[0];
    await expect(insertar(c, { monto: 6000, reversa_de: original.id })).rejects.toThrow();
  });
});

test('UPDATE y DELETE abortan por trigger', async () => {
  await tx(async (c) => {
    const { id } = (await insertar(c, { monto: 1000 })).rows[0];
    await expect(c.query('UPDATE pagos_app SET monto_clp = 1 WHERE id = $1', [id])).rejects.toThrow();
  });
  await tx(async (c) => {
    const { id } = (await insertar(c, { monto: 1000 })).rows[0];
    await expect(c.query('DELETE FROM pagos_app WHERE id = $1', [id])).rejects.toThrow();
  });
});
