/**
 * @jest-environment node
 */
const getServerSession = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const { jwtVerify, generateKeyPair, exportPKCS8 } = jest.requireActual('jose');

const ENDPOINT = 'https://6a6df4a491ecf2aec48f3e78.powersync.journeyapps.com';

let GET: typeof import('./route').GET;
let publicKey: CryptoKey;

beforeAll(async () => {
  // Par de llaves RS256 de prueba: la privada (PKCS8, base64) se setea como
  // POWERSYNC_JWT_PRIVATE_KEY; la pública se usa para verificar el token.
  const { privateKey, publicKey: pub } = await generateKeyPair('RS256', { extractable: true });
  publicKey = pub;
  const pem = await exportPKCS8(privateKey);
  process.env.POWERSYNC_JWT_PRIVATE_KEY = Buffer.from(pem, 'utf8').toString('base64');
  process.env.POWERSYNC_INSTANCE_URL = ENDPOINT;
  const routeMod = await import('./route');
  GET = routeMod.GET;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('app/api/powersync/token', () => {
  it('GET retorna 401 sin sesión', async () => {
    getServerSession.mockResolvedValue(null as any);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('No autorizado');
  });

  it('GET firma JWT RS256 válido con payload y exp correctos', async () => {
    getServerSession.mockResolvedValue({
      user: { id: '7', rol: 'bodeguero' },
    } as any);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.endpoint).toBe(ENDPOINT);

    const { payload, protectedHeader } = await jwtVerify(body.token, publicKey);

    expect(protectedHeader.alg).toBe('RS256');
    expect(protectedHeader.kid).toBe('bazar-naty-rs256-v1');
    expect(payload.sub).toBe('7');
    expect(payload.aud).toBe(ENDPOINT);
    expect(payload.rol).toBe('bodeguero');
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
    expect(Number(payload.exp) - Number(payload.iat)).toBe(1800);
  });

  it('GET retorna 500 si falta POWERSYNC_JWT_PRIVATE_KEY', async () => {
    getServerSession.mockResolvedValue({
      user: { id: '7', rol: 'bodeguero' },
    } as any);
    delete process.env.POWERSYNC_JWT_PRIVATE_KEY;

    const res = await GET();

    expect(res.status).toBe(500);

    const { generateKeyPair: g, exportPKCS8: e } = jest.requireActual('jose');
    const { privateKey } = await g('RS256', { extractable: true });
    process.env.POWERSYNC_JWT_PRIVATE_KEY = Buffer.from(await e(privateKey), 'utf8').toString('base64');
  });
});
