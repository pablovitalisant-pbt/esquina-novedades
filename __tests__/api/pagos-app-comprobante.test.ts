/**
 * @jest-environment node
 *
 * Fase B — N12d2: comprobante privado de una transferencia.
 * GET sirve la imagen solo a Pablo y Paola con no-store y nosniff.
 * POST solo lo acepta Pablo, una imagen válida y un adjunto por pago.
 */
const getServerSession = jest.fn();
const sqlMock = jest.fn();
jest.mock('next-auth', () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => sqlMock(...a) }));
jest.mock('@/config/feature-flags.json', () =>
  require('@/__tests__/helpers/mockFlags').mockFlags({ 'pagos-app-privados': true })
);
const { GET, POST } = require('@/app/api/admin/pagos-app/[id]/comprobante/route');
const ID = '11111111-1111-4111-8111-111111111111';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GRANDE = new Uint8Array(2 * 1024 * 1024 + 1).fill(0x89);
const ctx = { params: Promise.resolve({ id: ID }) };
const sesion = (id: string) => ({ user: { id, rol: 'admin' } });
const pedido = (bytes: Uint8Array = PNG, tipo = 'image/png') =>
  new Request(`http://localhost/api/admin/pagos-app/${ID}/comprobante`, {
    method: 'POST',
    headers: { 'content-type': tipo },
    body: Uint8Array.from(bytes),
  });
const pagoTransferencia = [{ medio: 'transferencia', reversa_de: null }];
beforeEach(() => {
  jest.clearAllMocks();
  process.env.PAGOS_APP_PABLO_ID = '1';
  process.env.PAGOS_APP_PAOLA_ID = '2';
  sqlMock.mockImplementation(async (s: TemplateStringsArray) =>
    /INSERT/i.test(s.join(' ')) ? [{ pago_id: ID }] : pagoTransferencia
  );
});
afterAll(() => { delete process.env.PAGOS_APP_PABLO_ID; delete process.env.PAGOS_APP_PAOLA_ID; });

describe('GET /api/admin/pagos-app/[id]/comprobante', () => {
  it('sirve la imagen a Paola con no-store y nosniff', async () => {
    getServerSession.mockResolvedValue(sesion('2'));
    sqlMock.mockResolvedValueOnce([
      { mime: 'image/png', bytes_b64: Buffer.from(PNG).toString('base64') },
    ]);
    const res = await GET(new Request('http://localhost/x'), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('responde 404 a un tercero sin tocar la base', async () => {
    getServerSession.mockResolvedValue(sesion('999'));
    const res = await GET(new Request('http://localhost/x'), ctx);
    expect(res.status).toBe(404);
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
describe('POST /api/admin/pagos-app/[id]/comprobante', () => {
  it('rechaza a Paola con 403', async () => {
    getServerSession.mockResolvedValue(sesion('2'));
    const res = await POST(pedido(), ctx);
    expect(res.status).toBe(403);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it.each([
    ['formato incoherente', JPEG, 'image/png'],
    ['más de 2 MiB', GRANDE, 'image/png'],
  ])('rechaza %s con 400', async (_caso, bytes, tipo) => {
    getServerSession.mockResolvedValue(sesion('1'));
    const res = await POST(pedido(bytes, tipo), ctx);
    expect(res.status).toBe(400);
  });
  it('adjunta el comprobante a una transferencia de Pablo', async () => {
    getServerSession.mockResolvedValue(sesion('1'));
    const res = await POST(pedido(), ctx);
    expect(res.status).toBe(201);
    expect(sqlMock.mock.calls.filter(([s]) => /INSERT/i.test(s.join(' ')))).toHaveLength(1);
  });

  it('responde 409 si el pago ya tiene comprobante', async () => {
    getServerSession.mockResolvedValue(sesion('1'));
    sqlMock.mockImplementation(async (s: TemplateStringsArray) =>
      /INSERT/i.test(s.join(' ')) ? [] : pagoTransferencia
    );
    const res = await POST(pedido(), ctx);
    expect(res.status).toBe(409);
  });
});
