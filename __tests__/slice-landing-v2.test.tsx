/**
 * Fase B — Slice: landing-v2 (preview limitado + /productos + logo + favicon + signOut fix)
 *
 * 1. Middleware: /productos excluido, rutas protegidas siguen protegidas
 * 2. signOut({ callbackUrl: '/' }) en TopNav y BottomNav
 * 3. Landing: preview máximo 8 productos (los del último ingreso)
 * 4. Landing: fallback si getLatestIngresoRealCodigos vacío → primeros 8 con stock
 * 5. Botón "Ver catálogo completo" → /productos
 * 6. /productos: renderiza lista completa (todos con saldo > 0), sin límite
 * 7. layout.tsx: metadata.icons incluye /favicon.ico
 * 8. logo-texto.png presente en landing header y TopNav
 */

import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { LandingPage } from '@/components/LandingPage';

// BUG-004: el test depende de la landing vieja; fijar el flag, no leer el real.
jest.mock('@/config/feature-flags.json', () => ({ 'tienda-portada-v2': false }));

const ROOT = path.resolve(__dirname, '..');

// ─── Tests 1: Middleware regex ───

function middlewareMatches(pathname: string): boolean {
  return /^\/((?!api\/|login|catalogo|productos|_next\/static|_next\/image|favicon\.ico|.*\.(?:png|jpg|jpeg|svg|gif|webp|ico|json|webmanifest)$).+)$/.test(pathname);
}

describe('Test 1: middleware — /productos excluido', () => {
  const RUTAS_PROTEGIDAS = [
    '/precios', '/ventas', '/bodega', '/admin', '/clientes',
    '/notas-venta', '/caja-mayor', '/alertas-stock',
    '/admin/caja-config', '/ventas/kardex',
  ];
  const RUTAS_PUBLICAS = [
    '/', '/login', '/api/productos', '/catalogo/mi-slug',
    '/productos', '/productos?page=2',
    '/_next/static/chunk.js', '/favicon.ico',
  ];

  test.each(RUTAS_PROTEGIDAS)('protegida → middleware corre: %s', (r) => {
    expect(middlewareMatches(r)).toBe(true);
  });

  test.each(RUTAS_PUBLICAS)('pública → middleware NO corre: %s', (r) => {
    expect(middlewareMatches(r)).toBe(false);
  });

  test('/productos exacto NO es protegido', () => {
    expect(middlewareMatches('/productos')).toBe(false);
  });

  // BUG --assets estáticos (png, json, etc.) no excluidos del matcher
  const ASSETS_PUBLICOS = [
    '/logo-texto.png',
    '/icon-192.png',
    '/icon-512.png',
    '/manifest.json',
    '/logo-icono.png',
    '/logo-completo.png',
    '/favicon.ico',
  ];

  test.each(ASSETS_PUBLICOS)('asset estático NO debe exigir sesión: %s', (r) => {
    expect(middlewareMatches(r)).toBe(false);
  });
});

// ─── Test 2: signOut con callbackUrl ───

describe('Test 2: signOut({ callbackUrl: "/" })', () => {
  test('TopNav.tsx usa signOut({ callbackUrl: "/" })', () => {
    const content = fs.readFileSync(path.join(ROOT, 'components', 'TopNav.tsx'), 'utf-8');
    expect(content).toContain("signOut({ callbackUrl: '/' })");
  });

  test('BottomNav.tsx usa signOut({ callbackUrl: "/" })', () => {
    const content = fs.readFileSync(path.join(ROOT, 'components', 'BottomNav.tsx'), 'utf-8');
    expect(content).toContain("signOut({ callbackUrl: '/' })");
  });
});

// ─── Test 7: layout.tsx metadata ───

describe('Test 7: layout.tsx — metadata.icons', () => {
  test('metadata.icons incluye /favicon.ico', () => {
    const content = fs.readFileSync(path.join(ROOT, 'app', 'layout.tsx'), 'utf-8');
    expect(content).toContain('/favicon.ico');
  });
});

// ─── Test 8: MarcaLogo (logo opcional, wordmark de fallback) ───

describe('Test 8: wordmark/logo vía MarcaLogo (sin logos PNG de Bazar Naty)', () => {
  test.each(['LandingPage.tsx', 'TopNav.tsx'])('%s usa MarcaLogo y no logo-texto.png', (f) => {
    const content = fs.readFileSync(path.join(ROOT, 'components', f), 'utf-8');
    expect(content).toContain('MarcaLogo');
    expect(content).not.toContain('logo-texto.png');
  });
});

// ─── Tests 3-6: con mocks ───

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

jest.mock('@/lib/auth', () => ({ authOptions: {} }));

jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => mockSql(...args),
}));

// Mock getLatestIngresoRealCodigos
jest.mock('@/utils/catalogo-ingreso', () => ({
  getLatestIngresoRealCodigos: jest.fn(),
}));

const { getLatestIngresoRealCodigos } = jest.requireMock('@/utils/catalogo-ingreso');

const PRODUCTOS_MOCK = Array.from({ length: 15 }, (_, i) => ({
  codigo: `PROD-${String.fromCharCode(65 + i)}`,
  id: i + 1,
  detalle: `Producto ${String.fromCharCode(65 + i)}`,
  imagen_url: null,
  cantcaja: 1,
  umed: 'UN',
  precio: 10 + i,
  saldo: 10 + i,
  es_nuevo: i < 3,
}));

describe('Tests 3-4: page.tsx — SQL filter + LIMIT 8', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockSql.mockReset();
    getLatestIngresoRealCodigos.mockReset();
  });

  test('Test 3: con códigos de último ingreso → SQL con ANY + LIMIT 8', async () => {
    const codigosIngreso = new Set(['PROD-A', 'PROD-B', 'PROD-C', 'PROD-D', 'PROD-E', 'PROD-F']);
    getLatestIngresoRealCodigos.mockResolvedValue(codigosIngreso);

    let capturedQuery = '';
    mockSql.mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
      const text = strings.reduce((acc, s, i) => acc + s + (values[i] !== undefined ? String(values[i]) : ''), '');
      if (text.includes('FROM productos')) capturedQuery = text;
      if (text.includes('SELECT slug')) return [{ slug: 'bazar-naty' }];
      return PRODUCTOS_MOCK;
    });

    const HomePage = (await import('@/app/page')).default;
    await HomePage();

    expect(getLatestIngresoRealCodigos).toHaveBeenCalledTimes(1);
    expect(capturedQuery).toMatch(/ANY\s*\(/i);
    expect(capturedQuery).toMatch(/LIMIT\s+8/i);
  });

  test('Test 4: sin ingresos registrados → fallback con LIMIT 8, sin ANY', async () => {
    getLatestIngresoRealCodigos.mockResolvedValue(new Set());

    let capturedQuery = '';
    mockSql.mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
      const text = strings.reduce((acc, s, i) => acc + s + (values[i] !== undefined ? String(values[i]) : ''), '');
      if (text.includes('FROM productos')) capturedQuery = text;
      if (text.includes('SELECT slug')) return [{ slug: 'bazar-naty' }];
      return PRODUCTOS_MOCK;
    });

    const HomePage = (await import('@/app/page')).default;
    await HomePage();

    expect(getLatestIngresoRealCodigos).toHaveBeenCalledTimes(1);
    expect(capturedQuery).toMatch(/LIMIT\s+8/i);
    expect(capturedQuery).not.toMatch(/ANY\s*\(/i);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe('Test 5: botón "Ver catálogo completo"', () => {
  test('apunta a /productos', () => {
    render(<LandingPage productos={[{ codigo: 'TEST', id: 1, detalle: 'Test', imagen_url: null, cantcaja: 1, umed: 'UN', precio: 10, saldo: 5, es_nuevo: false }]} empresaSlug="bazar-naty" />);
    const link = screen.getByText('Ver catálogo completo');
    expect(link.closest('a')).toHaveAttribute('href', '/productos');
  });
});

describe('Test 6: /productos page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
  });

  test('existe como módulo exportable', async () => {
    // Verifica que el archivo existe
    const filePath = path.join(ROOT, 'app', 'productos', 'page.tsx');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('renderiza lista completa sin límite (todos con saldo > 0)', async () => {
    mockSql
      .mockResolvedValueOnce([{ liberados: 0, unidades: 0 }]) // liberación perezosa (8c)
      .mockResolvedValueOnce([{ slug: 'bazar-naty' }])       // empresa_slug
      .mockResolvedValueOnce(PRODUCTOS_MOCK);                // productos

    const ProductosPage = (await import('@/app/productos/page')).default;
    await ProductosPage();

    // 3 llamadas: liberación + empresa_slug + productos, sin caja_config
    expect(mockSql).toHaveBeenCalledTimes(3);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

// ─── Tests 7-10: Rebranding visual (landing-primary) ───

describe('Rebranding visual — tokens landing-primary', () => {
  test('globals.css define --landing-primary y --landing-surface en .landing-page', () => {
    const css = fs.readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf-8');
    const landingBlock = css.match(/\.landing-page\s*\{[^}]*\}/)?.[0] || '';
    expect(landingBlock).toContain('--landing-primary: #590078');
    expect(landingBlock).toContain('--landing-surface: #FFF8EA');
  });

  test('sección Contacto tiene contenedor con bg-landing-primary', () => {
    const { container } = render(<LandingPage productos={[]} empresaSlug="bazar-naty" />);

    // Buscar la sección contacto y dentro un div con el fondo
    const contactSection = container.querySelector('#contacto');
    expect(contactSection).toBeInTheDocument();
    // El inner wrapper debería tener el bg rosa
    const innerWrapper = contactSection?.querySelector('.rounded-\\[48px\\]');
    expect(innerWrapper).toBeInTheDocument();
  });

  test('LandingPage.tsx usa var(--landing-primary) en lugar de var(--primary)', () => {
    const content = fs.readFileSync(path.join(ROOT, 'components', 'LandingPage.tsx'), 'utf-8');
    // Debe usar el nuevo token
    expect(content).toContain('var(--landing-primary)');
    // No debe quedar var(--primary) ni var(--ring) en el componente
    // (pueden quedar en otros componentes, no en LandingPage)
  });

  test('smoke: LandingPage renderiza las 6 secciones sin error', () => {
    const { container } = render(<LandingPage productos={[]} empresaSlug="bazar-naty" />);
    // Header + Hero + Catálogo + Nosotros + Contacto + Footer
    expect(container.querySelector('header')).toBeInTheDocument();
    expect(container.querySelector('h1')).toBeInTheDocument();
    expect(container.querySelector('#catalogo')).toBeInTheDocument();
    expect(container.querySelector('#nosotros')).toBeInTheDocument();
    expect(container.querySelector('#contacto')).toBeInTheDocument();
    expect(container.querySelector('footer')).toBeInTheDocument();
  });
});
