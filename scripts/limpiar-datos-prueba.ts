import { Pool, type PoolClient } from '@neondatabase/serverless';

// C6 — limpieza de datos de prueba antes del go-live. NO ejecutar sin el host confirmado.
// Uso: npx tsx --env-file=.env.local scripts/limpiar-datos-prueba.ts --host=<host> [--ejecutar]

export const PEDIDOS = [
  'afb8e9f4-0c9c-495d-9216-b1b4276b8613',
  'e14b5bf3-9b48-42ca-b25c-5581ba8259ce',
  '67181656-22d3-4a80-8f63-6efc18d3d45d',
  'f715749f-2243-461e-b20c-4af74ad9d9ca', // pago real de validación en producción (2026-10-26)
];

export const CODIGOS = ['DEMO-001', 'DEMO-002', 'DEMO-003', 'DEMO-004', 'DEMO-005'];

const EMPRESA_ID = 1;

export type Fuente =
  | 'pedidos'
  | 'prenotas'
  | 'clientes'
  | 'movimientos'
  | 'productoIds'
  | 'codigos'
  | 'productos';

export type Sentencia = { tabla: string; sql: string; fuente: Fuente };

// Orden de borrado dictado por las FKs. productos va último.
export const PLAN: Sentencia[] = [
  { tabla: 'caja_movimiento_notas', fuente: 'prenotas',
    sql: `DELETE FROM public.caja_movimiento_notas WHERE prenota_id = ANY($1::int[])` },
  { tabla: 'clientes_saldo_favor_movimientos', fuente: 'prenotas',
    sql: `DELETE FROM public.clientes_saldo_favor_movimientos WHERE origen_prenota_id = ANY($1::int[]) OR aplicado_prenota_id = ANY($1::int[])` },
  { tabla: 'pedidos', fuente: 'pedidos',
    sql: `DELETE FROM public.pedidos WHERE id = ANY($1::uuid[])` },
  { tabla: 'prenotas', fuente: 'prenotas',
    sql: `DELETE FROM public.prenotas WHERE id = ANY($1::int[])` },
  { tabla: 'caja_movimientos', fuente: 'movimientos',
    sql: `DELETE FROM public.caja_movimientos WHERE id = ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM public.caja_movimiento_notas cmn WHERE cmn.movimiento_id = public.caja_movimientos.id)` },
  { tabla: 'clientes', fuente: 'clientes',
    sql: `DELETE FROM public.clientes WHERE id = ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM public.prenotas WHERE cliente_id = public.clientes.id) AND NOT EXISTS (SELECT 1 FROM public.pedidos WHERE cliente_id = public.clientes.id) AND NOT EXISTS (SELECT 1 FROM public.clientes_saldo_favor_movimientos WHERE cliente_id = public.clientes.id)` },
  { tabla: 'alertas_stock_bajo', fuente: 'productoIds',
    sql: `DELETE FROM public.alertas_stock_bajo WHERE producto_id = ANY($1::int[])` },
  { tabla: 'catalogo_items', fuente: 'productoIds',
    sql: `DELETE FROM public.catalogo_items WHERE producto_id = ANY($1::int[])` },
  { tabla: 'catalogo_precio_override', fuente: 'codigos',
    sql: `DELETE FROM public.catalogo_precio_override WHERE codigo = ANY($1::text[])` },
  { tabla: 'ubicaciones_bodega', fuente: 'codigos',
    sql: `DELETE FROM public.ubicaciones_bodega WHERE empresa_id = ${EMPRESA_ID} AND codigo = ANY($1::text[])` },
  { tabla: 'ingresos_mercaderia', fuente: 'codigos',
    sql: `DELETE FROM public.ingresos_mercaderia WHERE codigo = ANY($1::text[])` },
  { tabla: 'conciliaciones_stock', fuente: 'codigos',
    sql: `DELETE FROM public.conciliaciones_stock WHERE codigo = ANY($1::text[])` },
  { tabla: 'productos', fuente: 'productos',
    sql: `DELETE FROM public.productos WHERE id = ANY($1::int[]) AND codigo = ANY($2::text[])` },
];

// Dry-run: solo SELECTs.
export const CONTEO: Sentencia[] = [
  { tabla: 'pedidos', fuente: 'pedidos',
    sql: `SELECT COUNT(*)::int AS n FROM public.pedidos WHERE id = ANY($1::uuid[])` },
  { tabla: 'pedido_items', fuente: 'pedidos',
    sql: `SELECT COUNT(*)::int AS n FROM public.pedido_items WHERE pedido_id = ANY($1::uuid[])` },
  { tabla: 'prenotas', fuente: 'prenotas',
    sql: `SELECT COUNT(*)::int AS n FROM public.prenotas WHERE id = ANY($1::int[])` },
  { tabla: 'prenota_items', fuente: 'prenotas',
    sql: `SELECT COUNT(*)::int AS n FROM public.prenota_items WHERE prenota_id = ANY($1::int[])` },
  { tabla: 'caja_movimiento_notas', fuente: 'prenotas',
    sql: `SELECT COUNT(*)::int AS n FROM public.caja_movimiento_notas WHERE prenota_id = ANY($1::int[])` },
  { tabla: 'caja_movimientos', fuente: 'movimientos',
    sql: `SELECT COUNT(*)::int AS n FROM public.caja_movimientos WHERE id = ANY($1::uuid[])` },
  { tabla: 'clientes', fuente: 'clientes',
    sql: `SELECT COUNT(*)::int AS n FROM public.clientes WHERE id = ANY($1::uuid[])` },
  { tabla: 'clientes_saldo_favor_movimientos', fuente: 'prenotas',
    sql: `SELECT COUNT(*)::int AS n FROM public.clientes_saldo_favor_movimientos WHERE origen_prenota_id = ANY($1::int[]) OR aplicado_prenota_id = ANY($1::int[])` },
  { tabla: 'alertas_stock_bajo', fuente: 'productoIds',
    sql: `SELECT COUNT(*)::int AS n FROM public.alertas_stock_bajo WHERE producto_id = ANY($1::int[])` },
  { tabla: 'catalogo_items', fuente: 'productoIds',
    sql: `SELECT COUNT(*)::int AS n FROM public.catalogo_items WHERE producto_id = ANY($1::int[])` },
  { tabla: 'catalogo_precio_override', fuente: 'codigos',
    sql: `SELECT COUNT(*)::int AS n FROM public.catalogo_precio_override WHERE codigo = ANY($1::text[])` },
  { tabla: 'ubicaciones_bodega', fuente: 'codigos',
    sql: `SELECT COUNT(*)::int AS n FROM public.ubicaciones_bodega WHERE empresa_id = ${EMPRESA_ID} AND codigo = ANY($1::text[])` },
  { tabla: 'ingresos_mercaderia', fuente: 'codigos',
    sql: `SELECT COUNT(*)::int AS n FROM public.ingresos_mercaderia WHERE codigo = ANY($1::text[])` },
  { tabla: 'conciliaciones_stock', fuente: 'codigos',
    sql: `SELECT COUNT(*)::int AS n FROM public.conciliaciones_stock WHERE codigo = ANY($1::text[])` },
  { tabla: 'productos', fuente: 'productos',
    sql: `SELECT COUNT(*)::int AS n FROM public.productos WHERE id = ANY($1::int[]) AND codigo = ANY($2::text[])` },
];

export function parseArgs(argv: string[]): { host: string | null; ejecutar: boolean } {
  let host: string | null = null;
  let ejecutar = false;
  for (const arg of argv) {
    if (arg.startsWith('--host=')) host = arg.slice('--host='.length);
    else if (arg === '--ejecutar') ejecutar = true;
  }
  return { host, ejecutar };
}

export function validarHost(databaseUrl: string, host: string | null): string {
  if (!host) throw new Error('Falta --host=<host>. Sin confirmación explícita no se toca la base.');
  const real = new URL(databaseUrl).hostname;
  if (host !== real) throw new Error(`Host no coincide: argumento "${host}" vs DATABASE_URL "${real}".`);
  return real;
}

type Ctx = {
  prenotas: number[];
  clientes: string[];
  movimientos: string[];
  productoIds: number[];
};

async function capturar(client: PoolClient): Promise<Ctx> {
  const { rows: ped } = await client.query(
    `SELECT prenota_id, cliente_id, caja_movimiento_id
       FROM public.pedidos WHERE id = ANY($1::uuid[])`,
    [PEDIDOS]
  );
  const prenotas = unicos(ped.map((r) => r.prenota_id)).map(Number);
  const clientes = unicos(ped.map((r) => r.cliente_id));
  const movimientos = unicos(ped.map((r) => r.caja_movimiento_id));

  if (prenotas.length > 0) {
    const { rows: cmn } = await client.query(
      `SELECT DISTINCT movimiento_id FROM public.caja_movimiento_notas
        WHERE prenota_id = ANY($1::int[])`,
      [prenotas]
    );
    movimientos.push(...unicos(cmn.map((r) => r.movimiento_id)));
  }

  const { rows: prod } = await client.query(
    `SELECT id FROM public.productos WHERE codigo = ANY($1::text[])`,
    [CODIGOS]
  );
  return { prenotas, clientes, movimientos: unicos(movimientos), productoIds: prod.map((r) => Number(r.id)) };
}

function unicos<T>(valores: (T | null | undefined)[]): T[] {
  return [...new Set(valores.filter((v): v is T => v !== null && v !== undefined && v !== ''))];
}

function params(fuente: Fuente, ctx: Ctx): unknown[] {
  const map: Record<Fuente, unknown[]> = {
    pedidos: [PEDIDOS],
    prenotas: [ctx.prenotas],
    clientes: [ctx.clientes],
    movimientos: [ctx.movimientos],
    productoIds: [ctx.productoIds],
    codigos: [CODIGOS],
    productos: [ctx.productoIds, CODIGOS],
  };
  return map[fuente];
}

async function main() {
  const { host, ejecutar } = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no está definida.');
  validarHost(url, host);

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  let enTx = false;
  try {
    const ctx = await capturar(client);

    if (!ejecutar) {
      console.table(
        await Promise.all(
          CONTEO.map(async (c) => {
            const { rows } = await client.query(c.sql, params(c.fuente, ctx));
            return { tabla: c.tabla, filas: Number(rows[0]?.n ?? 0) };
          })
        )
      );
      console.log('DRY-RUN: no se borró nada. Agrega --ejecutar para escribir.');
      return;
    }

    await client.query('BEGIN');
    enTx = true;

    for (const paso of PLAN) {
      if (paso.tabla === 'productos') {
        const { rows } = await client.query(
          `SELECT
             (SELECT COUNT(*)::int FROM public.pedido_items WHERE producto_id = ANY($1::int[])) AS pedidos,
             (SELECT COUNT(*)::int FROM public.prenota_items WHERE codigo = ANY($2::text[])) AS notas`,
          [ctx.productoIds, CODIGOS]
        );
        const { pedidos, notas } = rows[0];
        if (Number(pedidos) > 0 || Number(notas) > 0) {
          throw new Error(
            `Guard: quedan referencias a productos DEMO fuera del alcance (pedido_items=${pedidos}, prenota_items=${notas}). ROLLBACK.`
          );
        }
      }
      const res = await client.query(paso.sql, params(paso.fuente, ctx));
      console.log(`${paso.tabla}: ${res.rowCount} fila(s) borrada(s)`);
    }

    await client.query('COMMIT');
    enTx = false;
    console.log('Listo. Commit aplicado.');
  } catch (error) {
    if (enTx) await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('limpiar-datos-prueba.ts')) {
  main().catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
  });
}
