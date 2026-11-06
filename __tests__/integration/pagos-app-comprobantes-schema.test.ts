/** @jest-environment node */
/**
 * N12a2 Fase B — pagos_app_comprobantes contra Postgres TEST.
 * Host EXACTO; cada caso en BEGIN/ROLLBACK (mutaciones en transacciones
 * separadas para no leer un aborto previo). Sin datos reales.
 */
import { Pool, type PoolClient } from '@neondatabase/serverless';

const HOST_TEST = 'ep-polished-union-b66ujjc5-pooler.c-2.sa-east-1.aws.neon.tech';
const url = process.env.DATABASE_URL ?? '';
if (new URL(url).hostname !== HOST_TEST) throw new Error(`N12a2: DATABASE_URL no es el host TEST exacto (${HOST_TEST})`);
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

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const actor = async (c: PoolClient): Promise<number> =>
  (await c.query(`INSERT INTO usuarios (rut, nombre, rol, password)
     VALUES ($1, 'Prueba N12a2', 'admin', '!') RETURNING id`, [`T${crypto.randomUUID().slice(0, 18)}`])).rows[0].id;

const pago = async (c: PoolClient, medio = 'transferencia', reversaDe: string | null = null): Promise<string> =>
  (await c.query(`INSERT INTO pagos_app (clave, fecha, medio, monto_clp, detalle, reversa_de)
     VALUES ($1, '2026-11-06', $2, 1000, 'prueba', $3) RETURNING id`, [crypto.randomUUID(), medio, reversaDe])).rows[0].id;

const insertar = (c: PoolClient, pagoId: string, subidoPor: number, mime = 'image/png', bytes = PNG) =>
  c.query(`INSERT INTO pagos_app_comprobantes (pago_id, mime, bytes, subido_por)
     VALUES ($1, $2, $3, $4) RETURNING pago_id`, [pagoId, mime, bytes, subidoPor]);

const codigo = async (p: Promise<unknown>): Promise<string | undefined> => {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code;
  }
  throw new Error('se esperaba un error de la base');
};

afterAll(() => pool.end());

test('comprobante válido sobre transferencia no reversa', async () => {
  const fila = await tx(async (c) => (await insertar(c, await pago(c), await actor(c))).rows[0]);
  expect(fila.pago_id).toBeTruthy();
});

test('rechaza efectivo y reversa con 23514', async () => {
  await tx(async (c) => {
    const efectivo = await pago(c, 'efectivo');
    expect(await codigo(insertar(c, efectivo, await actor(c)))).toBe('23514');
  });
  await tx(async (c) => {
    const original = await pago(c);
    const reversa = await pago(c, 'transferencia', original);
    expect(await codigo(insertar(c, reversa, await actor(c)))).toBe('23514');
  });
});

test('rechaza duplicado del mismo pago con 23505', async () => {
  await tx(async (c) => {
    const p = await pago(c);
    const u = await actor(c);
    await insertar(c, p, u);
    expect(await codigo(insertar(c, p, u))).toBe('23505');
  });
});

test('rechaza MIME no permitido con 23514', async () => {
  await tx(async (c) => {
    expect(await codigo(insertar(c, await pago(c), await actor(c), 'application/pdf'))).toBe('23514');
  });
});

test('rechaza bytes vacíos o sobre 2 MiB con 23514', async () => {
  await tx(async (c) => {
    const p = await pago(c);
    expect(await codigo(insertar(c, p, await actor(c), 'image/png', Buffer.alloc(0)))).toBe('23514');
  });
  await tx(async (c) => {
    const p = await pago(c);
    expect(await codigo(insertar(c, p, await actor(c), 'image/png', Buffer.alloc(2 * 1024 * 1024 + 1)))).toBe('23514');
  });
});

test('UPDATE y DELETE abortan por trigger con P0001', async () => {
  await tx(async (c) => {
    const p = await pago(c);
    await insertar(c, p, await actor(c));
    expect(await codigo(c.query('UPDATE pagos_app_comprobantes SET mime = mime WHERE pago_id = $1', [p]))).toBe('P0001');
  });
  await tx(async (c) => {
    const p = await pago(c);
    await insertar(c, p, await actor(c));
    expect(await codigo(c.query('DELETE FROM pagos_app_comprobantes WHERE pago_id = $1', [p]))).toBe('P0001');
  });
});
