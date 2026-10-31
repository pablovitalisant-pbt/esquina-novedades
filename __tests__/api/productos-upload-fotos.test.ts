/**
 * @jest-environment node
 *
 * Fase B — fotos-1: limites del servidor y aislamiento por empresa.
 */
jest.mock('next-auth', () => ({
  __esModule: true,
  getServerSession: jest.fn(),
}));
jest.mock('@/lib/auth', () => ({ __esModule: true, authOptions: {} }));
jest.mock('@/lib/db', () => ({ sql: jest.fn() }));
jest.mock('@/lib/cloudinary', () => ({ uploadImage: jest.fn() }));

import { getServerSession } from 'next-auth';
import { sql } from '@/lib/db';
import { uploadImage } from '@/lib/cloudinary';

const { POST } = require('@/app/api/productos/upload/route');

const CREDS = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const;
const envOriginal = { ...process.env };

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/productos/upload', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of CREDS) process.env[k] = 'test';
  (getServerSession as jest.Mock).mockResolvedValue({
    user: { id: 1, rol: 'admin', empresas: [7] },
  });
  (uploadImage as jest.Mock).mockResolvedValue({
    secure_url: 'https://res.cloudinary.com/demo/image/upload/v9/productos/A.jpg',
    public_id: 'productos/A',
  });
  (sql as unknown as jest.Mock).mockResolvedValue([]);
});

afterAll(() => {
  process.env = envOriginal;
});

describe('POST /api/productos/upload — fotos-1', () => {
  it('responde 413 antes de Cloudinary si imageBase64 supera 4 MB', async () => {
    const response = await POST(
      request({ imageBase64: 'A'.repeat(4 * 1024 * 1024 + 1), codigo: 'A' })
    );

    expect(response.status).toBe(413);
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it('responde 503 si faltan las credenciales de Cloudinary', async () => {
    for (const k of CREDS) delete process.env[k];

    const response = await POST(
      request({ imageBase64: 'data:image/jpeg;base64,AAAA', codigo: 'A' })
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Fotos no configuradas' });
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it('usa public_id saneado bajo productos/ y filtra el UPDATE por empresa_id', async () => {
    const response = await POST(
      request({ imageBase64: 'data:image/jpeg;base64,AAAA', codigo: 'AB C/D.1' })
    );

    expect(response.status).toBe(200);
    expect(uploadImage).toHaveBeenCalledWith(
      'data:image/jpeg;base64,AAAA',
      'productos/AB_C_D_1'
    );

    const [strings, ...valores] = (sql as unknown as jest.Mock).mock.calls[0];
    expect(strings.join(' ')).toMatch(/empresa_id\s*=/);
    expect(valores).toContain(7);
  });
});
