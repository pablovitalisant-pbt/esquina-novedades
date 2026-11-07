/**
 * Fase B — M07: POS primero en la barra superior (solo con pos-v1 activo).
 */
import { render } from '@testing-library/react';
import { TopNav } from '@/components/TopNav';

var mockRol = 'admin';
var mockPosV1 = true;

jest.mock('next/navigation', () => ({
  usePathname: () => '/precios',
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { nombre: 'Admin Test', rol: mockRol } } }),
  signOut: jest.fn(),
}));
jest.mock('@/contexts/AlertasContext', () => ({ useAlertas: () => ({ stockBajoCount: 0 }) }));
jest.mock('@/config/feature-flags.json', () => {
  const flags = require('@/__tests__/helpers/mockFlags').mockFlags({});
  Object.defineProperty(flags, 'pos-v1', { get: () => mockPosV1, enumerable: true });
  return flags;
});
jest.mock('next/link', () => ({ children, href }: any) => require('react').createElement('a', { href }, children));

function itemsDeNav(rol: string, posV1 = true): string[] {
  mockRol = rol;
  mockPosV1 = posV1;
  const { container, unmount } = render(<TopNav />);
  const textos = Array.from(container.querySelectorAll('nav a, nav button')).map(
    (el) => el.textContent?.trim() ?? ''
  );
  unmount();
  return textos;
}

afterEach(() => {
  mockRol = 'admin';
  mockPosV1 = true;
});

describe('TopNav — POS primero', () => {
  it.each(['admin', 'vendedor'])('%s: POS antes de Ventas', (rol) => {
    const textos = itemsDeNav(rol);
    expect(textos.slice(0, 2)).toEqual(['POS', 'Ventas']);
  });

  it('pos-v1 apagado: Ventas primero y sin POS', () => {
    const textos = itemsDeNav('admin', false);
    expect(textos[0]).toBe('Ventas');
    expect(textos).not.toContain('POS');
  });

  it('bodeguero: sin POS ni Ventas (puedeBodega)', () => {
    const textos = itemsDeNav('bodeguero');
    expect(textos).not.toContain('POS');
    expect(textos).not.toContain('Ventas');
  });
});
