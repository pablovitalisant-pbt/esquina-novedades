/**
 * @jest-environment node
 *
 * Fase B — Slice 8c: GET /api/cron/liberar-reservas (proceso, no usuario).
 */
const liberar = jest.fn();
jest.mock('@/lib/pedidos/liberar-reservas', () => ({
  liberarReservasVencidas: (...a: any[]) => liberar(...a),
}));

const SECRET = 'cron-secret-8c';
let GET: (req: Request) => Promise<Response>;

beforeAll(async () => {
  ({ GET } = await import('@/app/api/cron/liberar-reservas/route'));
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  liberar.mockResolvedValue({ liberados: 2, unidades: 7 });
});

const req = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/cron/liberar-reservas', { headers });

it('sin header Authorization → 401 y no libera', async () => {
  const res = await GET(req());
  expect(res.status).toBe(401);
  expect(liberar).not.toHaveBeenCalled();
});

it('token correcto → 200 con el conteo de la liberación', async () => {
  const res = await GET(req({ Authorization: `Bearer ${SECRET}` }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ data: { liberados: 2, unidades: 7 } });
  expect(liberar).toHaveBeenCalledTimes(1);
});

it('token incorrecto → 401', async () => {
  const res = await GET(req({ Authorization: 'Bearer otro' }));
  expect(res.status).toBe(401);
  expect(liberar).not.toHaveBeenCalled();
});

it('CRON_SECRET no configurada → 500', async () => {
  delete process.env.CRON_SECRET;
  const res = await GET(req({ Authorization: 'Bearer ' }));
  expect(res.status).toBe(500);
  expect(liberar).not.toHaveBeenCalled();
});

export {};
