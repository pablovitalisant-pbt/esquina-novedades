/**
 * @jest-environment jsdom
 *
 * FASE B — slice "alertas-bell"
 * Tests de permisos y menu. DEBEN fallar en ROJO porque:
 * - vendedor NO tiene /alertas-stock en sus rutas de middleware (R1)
 * - vendedor obtiene 401 de las APIs (R2)
 * - vendedor NO ve "Alertas de stock" en menus (R7)
 */

import { render, screen, fireEvent } from '@testing-library/react';

// ─── Mocks globales ────────────────────────────────────────────────
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
      headers: new Map(),
    }),
  },
}));
jest.mock('next-auth', () => ({ __esModule: true, getServerSession: jest.fn() }));
jest.mock('@/lib/auth', () => ({ __esModule: true, authOptions: {} }));
jest.mock('@/lib/db', () => ({ sql: jest.fn().mockResolvedValue([{ count: 0 }]) }));
jest.mock('next/navigation', () => ({
  usePathname: () => '/precios',
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { nombre: 'Vendedor Test', rol: 'vendedor' } } }),
  signOut: jest.fn(),
}));
jest.mock('@/contexts/AlertasContext', () => ({ useAlertas: () => ({ stockBajoCount: 0 }) }));
jest.mock('next/link', () => ({ children, href }: any) =>
  require('react').createElement('a', { href }, children)
);
jest.mock('@/config/feature-flags.json', () => ({ registro_notas_bodega_ui: false }));

import { getServerSession } from 'next-auth';

// ══════════════════════════════════════════════════════════════════
// R1: middleware — vendedor deberia tener /alertas-stock
// ══════════════════════════════════════════════════════════════════
// Importamos la constante REAL desde lib/rutas-por-rol.ts, no una copia.
// Si alguien quita /alertas-stock de vendedor en produccion, este test
// lo detecta.
import { RUTAS_POR_ROL } from '@/lib/rutas-por-rol';

describe('R1 — middleware: ruta /alertas-stock para vendedor', () => {
  it('vendedor debe incluir /alertas-stock en RUTAS_POR_ROL — hoy falta', () => {
    expect(RUTAS_POR_ROL['vendedor']).toContain('/alertas-stock');
  });
});

// ══════════════════════════════════════════════════════════════════
// R2: API — vendedor deberia obtener 200 de los endpoints
// ══════════════════════════════════════════════════════════════════
describe('R2 — API alertas-stock con rol vendedor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: 1, rol: 'vendedor' },
    });
  });

  it('GET /api/alertas-stock devuelve 200 (hoy: 401)', async () => {
    const { GET } = require('@/app/api/alertas-stock/route');
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it('GET /api/alertas-stock/lista devuelve 200 (hoy: 401)', async () => {
    const { GET } = require('@/app/api/alertas-stock/lista/route');
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════
// R7: Menu — vendedor deberia ver "Alertas de stock"
// ══════════════════════════════════════════════════════════════════
describe('R7 — menu Bodega para vendedor incluye "Alertas de stock"', () => {
  describe('TopNav (desktop)', () => {
    it('item visible al abrir Bodega dropdown — hoy solo admin/bodeguero', () => {
      const { TopNav } = require('@/components/TopNav');
      render(<TopNav />);
      fireEvent.mouseEnter(screen.getByText('Bodega'));
      expect(screen.getByText('Alertas de stock')).toBeInTheDocument();
    });
  });

  describe('BottomNav (mobile)', () => {
    it('item visible al abrir sheet Bodega — hoy solo admin/bodeguero', () => {
      const { BottomNav } = require('@/components/BottomNav');
      render(<BottomNav />);
      fireEvent.click(screen.getByText('Bodega'));
      expect(screen.getByText('Alertas de stock')).toBeInTheDocument();
    });
  });
});
