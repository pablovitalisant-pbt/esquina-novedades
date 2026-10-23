/**
 * @jest-environment node
 *
 * TEST DE REGRESIÓN — bug 42P18 en POST /api/notas-venta/[id]/pagar.
 *
 * Causa raíz (2026-08-18): dentro del template literal sql`...`, un comentario
 * SQL contenía ${generaCredito} como texto explicativo. JS no distingue
 * comentarios SQL de código — esa interpolación se volvía un parámetro real
 * ($12) que nunca aparece en SQL parseable (Postgres descarta comentarios en
 * el lexer), así que su tipo era indeterminable: "could not determine data
 * type of parameter $12". Fallaba el PREPARE completo → 100% de los pagos
 * rechazados. Fix: quitar la interpolación del comentario.
 *
 * La única forma de atrapar este bug es invocar el HANDLER REAL (no una
 * reconstrucción de la query) contra una base con el schema real. Este test
 * importa POST de pagar/route.ts y lo llama con Request/params mockeados.
 *
 * Dependencia de schema: el handler escribe en clientes_saldo_favor_movimientos
 * (migración 035). Si esa tabla no existe en la base conectada, el test se
 * auto-salta (no es un fallo del handler). Hoy (2026-08-18) test-integration
 * NO tiene la 035 aplicada en su compute pooled (ver BUG en BUGS.md) — aplicar
 * la migración ahí activa este test sin más cambios. Mientras tanto se corrió
 * contra una rama Neon descartable con el schema real de producción.
 */
const { sql } = require('@/lib/db');

let mockSession: any = null;
jest.mock('next-auth', () => ({
  getServerSession: jest.fn().mockImplementation(() => Promise.resolve(mockSession)),
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));

let POST: any;
let skipAll = false;
const createdNotas: number[] = [];
const createdCobros: number[] = []; // ids de caja_movimientos (cobros) creados

function makeReq(notaId: number, overrides: any = {}) {
  const body = { moneda: 'USD', forma_pago: 'efectivo', cuenta_id: 1, ...overrides };
  return new Request(`http://localhost/api/notas-venta/${notaId}/pagar`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

async function crearNota(clienteId: string | null): Promise<number> {
  const r = await sql`
    INSERT INTO public.prenotas (titulo, titulo_base, usuario_id, nombre_cliente, cliente_id)
    VALUES ('REGR-42P18', 'REGR-42P18', ${mockSession.user.id}, 'Regr', ${clienteId})
    RETURNING id`;
  const id = r[0].id;
  createdNotas.push(id);
  await sql`
    INSERT INTO public.prenota_items (prenota_id, codigo, unidades, precio)
    VALUES (${id}, 'REGR', 1, 100)`;
  return id;
}

async function llamar(notaId: number, monto: number) {
  const res = await POST(makeReq(notaId, { monto }), { params: Promise.resolve({ id: String(notaId) }) });
  let body: any = null;
  try { body = await res.json(); } catch { /* sin body */ }
  // Guardar el id del cobro real insertado para poder limpiarlo por id exacto
  // (el body no incluye observaciones, así que NO se puede limpiar por ese campo).
  if (res.status === 201 && body?.cobro?.id != null) createdCobros.push(Number(body.cobro.id));
  return { status: res.status, error: body?.error ?? null, credito: body?.credito_generado ?? null };
}

beforeAll(async () => {
  // Auto-skip si la migración 035 no está aplicada en la base conectada.
  const t = await sql`SELECT to_regclass('public.clientes_saldo_favor_movimientos') AS x`.catch(() => [{ x: null }]);
  if (!t[0]?.x) { skipAll = true; console.warn('SKIP: clientes_saldo_favor_movimientos no existe (migración 035) en la base de test.'); return; }
  // Slice 5a: pagar suma pi.subtotal (migración 041).
  const cols = await sql`SELECT COUNT(*)::int AS n FROM information_schema.columns
    WHERE table_schema='public' AND table_name='prenota_items'
      AND column_name IN ('modalidad','subtotal')`.catch(() => [{ n: 0 }]);
  if ((cols[0]?.n ?? 0) < 2) { skipAll = true; console.warn('SKIP: prenota_items.modalidad/subtotal no existen (migración 041) en la base de test.'); return; }
  const admins = await sql`SELECT id, nombre FROM public.usuarios WHERE rol='admin' LIMIT 1`;
  if (!admins[0]) throw new Error('sin admin');
  mockSession = { user: { id: String(admins[0].id), rol: 'admin', nombre: admins[0].nombre } };
  const mod = await import('@/app/api/notas-venta/[id]/pagar/route');
  POST = mod.POST;
});

afterAll(async () => {
  // 1. Limpiar por ids exactos de los cobros reales insertados (los cobros se
  // crean con observaciones NULL, así que no se pueden limpiar por ese campo).
  for (const cid of createdCobros) {
    await sql`DELETE FROM public.caja_movimiento_notas WHERE movimiento_id = ${cid}`.catch(() => {});
    await sql`DELETE FROM public.caja_movimientos WHERE id = ${cid}`.catch(() => {});
  }
  // 2. Limpiar las notas y sus dependencias (por si algún cobro no llegó a 201).
  for (const nid of createdNotas) {
    await sql`DELETE FROM public.clientes_saldo_favor_movimientos WHERE origen_prenota_id = ${nid}`.catch(() => {});
    await sql`DELETE FROM public.caja_movimiento_notas WHERE prenota_id = ${nid}`.catch(() => {});
    await sql`DELETE FROM public.prenota_items WHERE prenota_id = ${nid}`.catch(() => {});
    await sql`DELETE FROM public.prenotas WHERE id = ${nid}`.catch(() => {});
  }
});

describe('42P18 regresión — handler real POST /pagar', () => {
  it('pago exacto sin sobrepago → 201, sin crédito', async () => {
    if (skipAll) return; // requiere migración 035 en la base conectada
    const cli = await sql`SELECT id FROM public.clientes LIMIT 1`;
    const notaId = await crearNota(cli[0].id);
    const r = await llamar(notaId, 100);
    expect(r.status).toBe(201);
    expect(r.error).toBeNull();
    expect(r.credito).toBe(0);
  });

  it('sobrepago con cliente → 201 y credito_generado', async () => {
    if (skipAll) return;
    const cli = await sql`SELECT id FROM public.clientes LIMIT 1`;
    const notaId = await crearNota(cli[0].id);
    const r = await llamar(notaId, 150); // total 100, excedente 50
    expect(r.status).toBe(201);
    expect(r.error).toBeNull();
    expect(r.credito).toBeCloseTo(50, 2);
  });

  it('sobrepago sin cliente → 201 y credito 0 (se capa)', async () => {
    if (skipAll) return;
    const notaId = await crearNota(null);
    const r = await llamar(notaId, 150);
    expect(r.status).toBe(201);
    expect(r.error).toBeNull();
    expect(r.credito).toBe(0);
  });
});
export {};
