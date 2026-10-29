/**
 * Fase B — Slice 8a: con `tienda-portada-v2` en false, "/" sigue siendo la
 * LandingPage institucional. El usuario con sesión sigue yendo a /precios.
 */
import { LandingPage } from '@/components/LandingPage';

jest.mock('@/config/feature-flags.json', () => ({ 'tienda-portada-v2': false }));

const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => mockRedirect(...args) }));

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));

const mockSql = jest.fn();
jest.mock('@/lib/db', () => ({ sql: (...args: unknown[]) => mockSql(...args) }));

jest.mock('@/utils/catalogo-ingreso', () => ({
  getLatestIngresoRealCodigos: jest.fn().mockResolvedValue(new Set()),
}));

jest.mock('@/components/TiendaPortada', () => ({ TiendaPortada: () => null }));

describe('flag tienda-portada-v2 OFF', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockSql.mockImplementation((strings: TemplateStringsArray) =>
      Promise.resolve(strings.join('').includes('SELECT slug') ? [{ slug: 'la-esquina' }] : []),
    );
  });

  test('renderiza la LandingPage actual', async () => {
    const HomePage = (await import('@/app/page')).default;
    const el = await HomePage();
    expect(el.type).toBe(LandingPage);
  });
});
