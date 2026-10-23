/**
 * @jest-environment node
 *
 * FASE B — Slice "Informe de Inversión en Mercadería".
 * Tests del endpoint POST /api/admin/inversion-mercaderia/snapshot
 * (cron diario 23:55 Bolivia vía Vercel Cron).
 *
 * Riesgos forzados:
 *  - llamada externa vía cron autenticada por secret (Bearer $CRON_SECRET),
 *    SIN sesión NextAuth (es un proceso, no un usuario).
 *  - Authorization ausente / token incorrecto → 401.
 *  - token correcto → 200 y persiste el snapshot.
 *  - idempotencia: UNIQUE(empresa_id, fecha) → el INSERT debe usar
 *    ON CONFLICT (upsert), no reventar con 500 si el cron dispara dos veces.
 *
 * La ruta app/api/admin/inversion-mercaderia/snapshot/route.ts NO existe aún
 * → rojo hasta Fase C. CRON_SECRET se lee de process.env.
 */

const sql = jest.fn();

jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sql(...args),
}));

const PRODUCTOS = [
  { codigo: 'A-1023', detalle: 'Producto X', saldo: 40, costo: 12.5, prcventa: 18 },
  { codigo: 'LEGACY-1', detalle: 'Legacy', saldo: 9, costo: null, prcventa: null },
];

// Enruta sql por contenido de query: robusto al orden de las llamadas.
// El POST resuelve primero la única empresa (cron no tiene sesión), luego
// productos, luego hace el upsert del snapshot y reemplaza el detalle.
function mockSnapshotDB() {
  sql.mockImplementation((template: string[]) => {
    const q = template.join('').toLowerCase();
    if (q.includes('from empresas')) return [{ id: 1 }];
    if (q.includes('from productos')) return PRODUCTOS;
    if (q.includes('snapshots_inversion_mercaderia') && q.includes('returning')) return [{ id: 7 }];
    return []; // DELETE detalle e INSERTs de detalle
  });
}

describe('POST /api/admin/inversion-mercaderia/snapshot — auth por secret', () => {
  let POST: (req: Request) => Promise<Response>;
  const SECRET = 'cron-secret-fase-b';

  beforeAll(async () => {
    process.env.CRON_SECRET = SECRET;
    const mod = await import('@/app/api/admin/inversion-mercaderia/snapshot/route');
    POST = mod.POST;
  });

  beforeEach(() => {
    sql.mockClear();
  });

  test('1 — sin header Authorization → 401', async () => {
    const res = await POST(new Request('http://localhost/api/admin/inversion-mercaderia/snapshot', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  test('2 — header Authorization con token incorrecto → 401', async () => {
    const res = await POST(new Request('http://localhost/api/admin/inversion-mercaderia/snapshot', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-incorrecto' },
    }));
    expect(res.status).toBe(401);
  });

  test('3 — header Authorization con CRON_SECRET correcto → 200 y persiste', async () => {
    mockSnapshotDB();
    const res = await POST(new Request('http://localhost/api/admin/inversion-mercaderia/snapshot', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}` },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Confirma que persiste el resumen calculado en el momento de la captura.
    expect(body).toHaveProperty('costoTotal');
    expect(body.costoTotal).toBe(500); // legacy (costo NULL) excluido
  });

  test('4 — funciona SIN sesión NextAuth (cron no es un usuario)', async () => {
    mockSnapshotDB();
    const res = await POST(new Request('http://localhost/api/admin/inversion-mercaderia/snapshot', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}` },
    }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/admin/inversion-mercaderia/snapshot — idempotencia', () => {
  let POST: (req: Request) => Promise<Response>;
  const SECRET = 'cron-secret-fase-b';

  beforeAll(async () => {
    process.env.CRON_SECRET = SECRET;
    const mod = await import('@/app/api/admin/inversion-mercaderia/snapshot/route');
    POST = mod.POST;
  });

  beforeEach(() => {
    sql.mockClear();
  });

  test('5 — el INSERT usa ON CONFLICT sobre (empresa_id, fecha) para no duplicar', async () => {
    mockSnapshotDB();
    await POST(new Request('http://localhost/api/admin/inversion-mercaderia/snapshot', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}` },
    }));

    // La query que hace RETURNING id debe ser el upsert del snapshot.
    const insertCall = sql.mock.calls.find((c: any[]) => {
      const t = (c[0] as string[]).join('').toLowerCase();
      return t.includes('snapshots_inversion_mercaderia') && t.includes('returning');
    });
    expect(insertCall).toBeTruthy();
    const template = (insertCall[0] as string[]).join('').toLowerCase();
    expect(template).toContain('on conflict');
    expect(template).toContain('empresa_id');
    expect(template).toContain('fecha');
  });

  test('6 — segundo disparo en la misma fecha no falla (upsert idempotente)', async () => {
    const req = () =>
      new Request('http://localhost/api/admin/inversion-mercaderia/snapshot', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SECRET}` },
      });

    mockSnapshotDB();
    const r1 = await POST(req());
    mockSnapshotDB();
    const r2 = await POST(req());
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });
});
export {};
