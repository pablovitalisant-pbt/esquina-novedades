/**
 * @jest-environment node
 *
 * Fase B — Slice 8a: liberación de reservas vencidas en UNA sola sentencia.
 * La idempotencia y la concurrencia las garantiza el UPDATE condicionado de la
 * CTE, así que se verifica la semántica del SQL emitido y el pasamanos del
 * resultado. Sin DB real: el mock simula la respuesta de Postgres.
 */
const sql = jest.fn();

jest.mock('@/lib/db', () => ({ sql: (...args: any[]) => sql(...args) }));

import { liberarReservasVencidas } from '@/lib/pedidos/liberar-reservas';

const query = () => (sql.mock.calls[0][0] as string[]).join(' ');

beforeEach(() => {
  jest.clearAllMocks();
  sql.mockResolvedValue([{ liberados: 0, unidades: 0 }]);
});

describe('una sola sentencia, sin ventana entre marcar y devolver', () => {
  it('emite un único statement', async () => {
    await liberarReservasVencidas();
    expect(sql).toHaveBeenCalledTimes(1);
    expect(query()).not.toContain(';');
    expect(query()).toMatch(/^\s*WITH\b/);
  });

  it('no usa fechas de Node: la expiración la evalúa la DB con NOW()', async () => {
    await liberarReservasVencidas();
    expect(query()).toContain('expira_en < NOW()');
  });
});

describe('qué pedidos libera', () => {
  it('solo pendiente_pago con stock_reservado y vencido', async () => {
    await liberarReservasVencidas();
    expect(query()).toMatch(
      /UPDATE\s+pedidos\s+SET\s+estado\s*=\s*'expirado'\s*,\s*stock_reservado\s*=\s*false\s+WHERE\s+estado\s*=\s*'pendiente_pago'\s+AND\s+stock_reservado\s*=\s*true\s+AND\s+expira_en\s*<\s*NOW\(\)/,
    );
  });

  it('no toca pedidos no vencidos ni otros estados', async () => {
    await liberarReservasVencidas();
    const q = query();
    expect(q).not.toMatch(/estado\s*=\s*'pendiente'\b/);
    expect(q).not.toMatch(/estado\s*=\s*'pagado'\b/);
    expect(q).not.toMatch(/estado\s*=\s*'pagado_tardio'/);
    expect(q).not.toMatch(/estado\s*=\s*'convertido'/);
    // El único UPDATE a pedidos está condicionado por la expiración.
    const updates = q.match(/UPDATE\s+pedidos\b[^;]*/g) ?? [];
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain('expira_en < NOW()');
  });

  it('un pedido sin stock_reservado no devuelve stock', async () => {
    await liberarReservasVencidas();
    const vencidos = query().match(/UPDATE\s+pedidos[\s\S]*?RETURNING\s+id/)?.[0] ?? '';
    expect(vencidos).toContain('stock_reservado = true');
  });
});

describe('devolución de unidades', () => {
  it('devuelve exactamente las unidades reservadas (pi.unidades), sin recalcular', async () => {
    await liberarReservasVencidas();
    expect(query()).toMatch(/SUM\(\s*pi\.unidades\s*\)/);
    expect(query()).not.toMatch(/cantcaja/);
  });

  it('cantcaja cambia después de reservar: se devuelven las unidades reservadas', async () => {
    // Reserva: 2 cajas de 6 unidades = 12 descontadas. Luego cantcaja pasa a 10.
    // Si el SQL recalculase con cantcaja devolvería 20; debe devolver 12.
    sql.mockResolvedValue([{ liberados: 1, unidades: 12 }]);
    const r = await liberarReservasVencidas();
    expect(query()).not.toMatch(/cantcaja/);
    expect(r.unidades).toBe(12);
  });

  it('filas con unidades NULL (sin reserva) no devuelven nada', async () => {
    await liberarReservasVencidas();
    expect(query()).toMatch(/pi\.unidades\s+IS\s+NOT\s+NULL/);
  });

  it('devuelve en productos y en ubicaciones_bodega', async () => {
    await liberarReservasVencidas();
    const q = query();
    expect(q).toMatch(/UPDATE\s+productos\s+\w+\s+SET\s+saldo\s*=\s*(?:COALESCE\(\w+\.saldo\s*,\s*0\)|\w+\.saldo)\s*\+\s*\w+\.unidades/);
    expect(q).toMatch(/UPDATE\s+ubicaciones_bodega\s+\w+\s+SET\s+saldo\s*=\s*(?:COALESCE\(\w+\.saldo\s*,\s*0\)|\w+\.saldo)\s*\+\s*\w+\.unidades/);
    expect(q).toMatch(/u\.codigo\s*=\s*p\.codigo\s+AND\s+u\.empresa_id\s*=\s*p\.empresa_id/);
  });

  it('agrupa por producto para no sumar dos veces un ítem repetido', async () => {
    await liberarReservasVencidas();
    expect(query()).toMatch(/GROUP\s+BY\s+pi\.producto_id/);
  });
});

describe('idempotencia y concurrencia', () => {
  it('la segunda llamada no devuelve doble: respeta lo que la DB devolvió', async () => {
    sql
      .mockResolvedValueOnce([{ liberados: 1, unidades: 6 }])
      .mockResolvedValueOnce([{ liberados: 0, unidades: 0 }]);

    const primera = await liberarReservasVencidas();
    const segunda = await liberarReservasVencidas();

    expect(primera).toEqual({ liberados: 1, unidades: 6 });
    expect(segunda).toEqual({ liberados: 0, unidades: 0 });
    expect(primera.unidades + segunda.unidades).toBe(6);
    // La función no acumula estado en JS: cada llamada es una sentencia.
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('sin vencidos devuelve ceros (no inventa liberaciones)', async () => {
    expect(await liberarReservasVencidas()).toEqual({ liberados: 0, unidades: 0 });
  });
});
