/**
 * Fase B — Slice: landing-page-public
 *
 * Tests del contrato, escritos antes de cerrar implementación.
 *
 * 1. Middleware regex: rutas protegidas siguen exigiendo sesión
 * 2. Middleware regex: / no exige sesión
 * 3. page.tsx: sesión activa → redirect a /precios
 * 4. page.tsx: sin sesión → renderiza LandingPage con productos
 * 5. Query: solo productos con SUM(saldo) > 0 aparecen
 * 6. LandingPage contiene link correcto de WhatsApp
 */

import { render, screen } from '@testing-library/react';
import { LandingPage } from '@/components/LandingPage';

// ─── Helpers ───

/** Reproduce la lógica del matcher de middleware.ts */
function middlewareMatches(pathname: string): boolean {
  return /^\/((?!api\/|login|catalogo|_next\/static|_next\/image|favicon\.ico).+)$/.test(pathname);
}

// ─── Tests 1 y 2: Middleware regex ───

describe('middleware matcher regex', () => {
  const RUTAS_PROTEGIDAS = [
    '/precios',
    '/ventas',
    '/bodega',
    '/admin',
    '/clientes',
    '/notas-venta',
    '/caja-mayor',
    '/alertas-stock',
    '/admin/caja-config',
    '/ventas/kardex',
  ];

  const RUTAS_PUBLICAS = [
    '/',
    '/login',
    '/api/productos',
    '/catalogo/mi-slug',
    '/_next/static/chunk.js',
    '/favicon.ico',
  ];

  test.each(RUTAS_PROTEGIDAS)('Test 1: RUTA PROTEGIDA → middleware DEBE correr: %s', (ruta) => {
    expect(middlewareMatches(ruta)).toBe(true);
  });

  test.each(RUTAS_PUBLICAS)('Test 2: RUTA PÚBLICA → middleware NO DEBE correr: %s', (ruta) => {
    expect(middlewareMatches(ruta)).toBe(false);
  });

  test('/ (raiz exacta) NO es protegida — diferencia clave con .*', () => {
    expect(middlewareMatches('/')).toBe(false);
  });
});

// ─── Mocks para tests 3-5 ───

const mockRedirect = jest.fn();
const mockGetServerSession = jest.fn();
const mockSql = jest.fn();

jest.mock('next/navigation', () => ({
  redirect: (...args: any[]) => {
    mockRedirect(...args);
    throw new Error('NEXT_REDIRECT');
  },
}));

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => mockSql(...args),
}));

const PRODUCTOS_MOCK = [
  { codigo: 'PROD-A', id: 1, detalle: 'Producto A', imagen_url: null, cantcaja: 12, umed: 'UN', precio: 25.50, saldo: 100, es_nuevo: true },
  { codigo: 'PROD-B', id: 2, detalle: 'Producto B', imagen_url: null, cantcaja: 1, umed: 'UN', precio: 5.00, saldo: 10, es_nuevo: false },
  { codigo: 'PROD-C', id: 3, detalle: 'Producto C', imagen_url: null, cantcaja: 6, umed: 'UN', precio: 15.00, saldo: 0, es_nuevo: false },
];

describe('page.tsx — comportamiento según sesión', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Test 3: sesión activa → redirect a /precios, no toca DB', async () => {
    mockGetServerSession.mockResolvedValue({ user: { name: 'Admin' } });

    try {
      const HomePage = (await import('@/app/page')).default;
      await HomePage();
    } catch {
      // redirect lanza NEXT_REDIRECT
    }

    expect(mockRedirect).toHaveBeenCalledWith('/precios');
    expect(mockSql).not.toHaveBeenCalled();
  });

  test('Test 4: sin sesión → llama sql y NO redirect', async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockSql.mockResolvedValue(PRODUCTOS_MOCK);

    const HomePage = (await import('@/app/page')).default;
    await HomePage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockSql).toHaveBeenCalled();
  });

  test('Test 5: query SQL contiene HAVING + SUM(saldo) + > 0', async () => {
    let capturedQuery = '';

    mockGetServerSession.mockResolvedValue(null);
    mockSql.mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
      const text = strings.reduce((acc, str, i) => acc + str + (values[i] || ''));
      // Capturar la query del catálogo (la que tiene HAVING), no las de getLatestIngresoRealCodigos
      if (text.includes('HAVING')) capturedQuery = text;
      return [];
    });

    const HomePage = (await import('@/app/page')).default;
    await HomePage();

    expect(capturedQuery).toContain('SUM(saldo)');
    expect(capturedQuery).toContain('HAVING');
    expect(capturedQuery).toContain('> 0');
    expect(capturedQuery).toContain('GROUP BY');
    expect(capturedQuery).not.toContain('catalogos');
  });
});

describe('Test 6: LandingPage — link de WhatsApp', () => {
  const defaultProps = { productos: [] as any[], empresaSlug: 'bazar-naty' };

  test('renderiza link a wa.me/5493878236289 en header y hero', () => {
    render(<LandingPage {...defaultProps} />);

    const links = screen.getAllByRole('link');
    const waLinks = links.filter(l => l.getAttribute('href')?.includes('wa.me/5493878236289'));
    expect(waLinks.length).toBeGreaterThanOrEqual(2);
    waLinks.forEach(l => {
      expect(l.getAttribute('href')).toBe('https://wa.me/5493878236289');
      expect(l.getAttribute('target')).toBe('_blank');
    });
  });

  test('renderiza placeholder cuando no hay productos', () => {
    render(<LandingPage {...defaultProps} />);
    expect(screen.getByText('No hay productos disponibles en este momento.')).toBeInTheDocument();
  });

  test('renderiza grid de productos cuando hay datos', () => {
    render(<LandingPage productos={PRODUCTOS_MOCK} empresaSlug="bazar-naty" />);
    expect(screen.getByText('PROD-A')).toBeInTheDocument();
    expect(screen.getByText('PROD-B')).toBeInTheDocument();
    expect(screen.getByText('Producto C')).toBeInTheDocument();
  });
});

describe('Nav del header — anchors y secciones', () => {
  const defaultProps = { productos: [] as any[], empresaSlug: 'bazar-naty' };

  test('nav links apuntan a #catalogo, #nosotros, #contacto', () => {
    render(<LandingPage {...defaultProps} />);

    const catalogo = screen.getByRole('link', { name: 'Catálogo' });
    const nosotros = screen.getByRole('link', { name: 'Quiénes Somos' });
    const contacto = screen.getByRole('link', { name: 'Contacto' });

    expect(catalogo).toHaveAttribute('href', '#catalogo');
    expect(nosotros).toHaveAttribute('href', '#nosotros');
    expect(contacto).toHaveAttribute('href', '#contacto');
  });

  test('secciones tienen ids: catalogo, nosotros, contacto', () => {
    const { container } = render(<LandingPage {...defaultProps} />);

    const catalogoSection = container.querySelector('#catalogo');
    const nosotrosSection = container.querySelector('#nosotros');
    const contactSection = container.querySelector('#contacto');

    expect(catalogoSection).toBeInTheDocument();
    expect(nosotrosSection).toBeInTheDocument();
    expect(contactSection).toBeInTheDocument();
  });

  test('link "Ingresar" apunta a /login', () => {
    render(<LandingPage {...defaultProps} />);

    const ingresar = screen.getByRole('link', { name: /ingresar/i });
    expect(ingresar).toHaveAttribute('href', '/login');
  });
});
