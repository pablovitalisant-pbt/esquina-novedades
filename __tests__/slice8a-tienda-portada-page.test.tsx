/**
 * Fase B — Slice 8a: con el flag encendido, "/" obtiene productos, categorías
 * y opciones de entrega y monta TiendaPortada. La sesión sigue redirigiendo.
 * /productos y / comparten la consulta (lib/tienda-productos).
 */
import fs from 'fs';
import path from 'path';

jest.mock('@/config/feature-flags.json', () => ({ 'tienda-portada-v2': true }));

const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => mockRedirect(...args) }));

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));

const mockSql = jest.fn();
jest.mock('@/lib/db', () => ({ sql: (...args: unknown[]) => mockSql(...args) }));

const mockProductos = jest.fn();
jest.mock('@/lib/tienda-productos', () => ({
  getProductosTienda: (...args: unknown[]) => mockProductos(...args),
}));

jest.mock('@/components/TiendaPortada', () => ({ TiendaPortada: () => null }));

const ROOT = path.resolve(__dirname, '..');

describe('flag tienda-portada-v2 ON', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockProductos.mockResolvedValue({ productos: [{ codigo: 'A' }], empresaSlug: 'la-esquina' });
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM categorias')) return Promise.resolve([{ id: 'c1', nombre: 'Hogar' }]);
      if (text.includes('FROM opciones_entrega')) return Promise.resolve([{ codigo: 'retiro', nombre: 'Retiro en tienda', activa: true }]);
      return Promise.resolve([]);
    });
  });

  test('monta TiendaPortada con productos, categorías y opciones', async () => {
    const HomePage = (await import('@/app/page')).default;
    const el = await HomePage();

    expect(mockProductos).toHaveBeenCalled();
    expect(el.props).toEqual(
      expect.objectContaining({
        productos: [{ codigo: 'A' }],
        categorias: [{ id: 'c1', nombre: 'Hogar' }],
        opcionesEntrega: [{ codigo: 'retiro', nombre: 'Retiro en tienda', activa: true }],
      }),
    );
  });

  test('con sesión redirige a /precios', async () => {
    mockGetServerSession.mockResolvedValue({ user: { rol: 'admin' } });
    const HomePage = (await import('@/app/page')).default;
    await HomePage();
    expect(mockRedirect).toHaveBeenCalledWith('/precios');
  });

  test('la consulta de productos está compartida con /productos', () => {
    const home = fs.readFileSync(path.join(ROOT, 'app', 'page.tsx'), 'utf-8');
    const productos = fs.readFileSync(path.join(ROOT, 'app', 'productos', 'page.tsx'), 'utf-8');
    expect(home).toContain('getProductosTienda');
    expect(productos).toContain('getProductosTienda');
  });
});
