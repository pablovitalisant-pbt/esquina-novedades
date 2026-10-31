/**
 * @jest-environment jsdom
 *
 * Fase B — pos-detalles: acceso directo al POS desde la barra inferior móvil.
 * Visible solo con `pos-v1` ON y rol admin/vendedor; activo en /pos.
 */
import { render, screen } from '@testing-library/react';
import { BottomNav } from '@/components/BottomNav';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import flags from '@/config/feature-flags.json';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));
jest.mock('@/config/feature-flags.json', () => ({ 'pos-v1': true }));

const mockFlags = flags as unknown as Record<string, boolean>;

function sesionCon(rol: string) {
  (useSession as jest.Mock).mockReturnValue({
    data: { user: { id: '1', rol } },
    status: 'authenticated',
  });
}

beforeEach(() => {
  mockFlags['pos-v1'] = true;
  (usePathname as jest.Mock).mockReturnValue('/');
});

const linkPos = () => screen.queryByRole('link', { name: 'POS' });

describe('BottomNav — botón POS', () => {
  test('admin ve el botón POS y lleva a /pos', () => {
    sesionCon('admin');
    render(<BottomNav />);
    const link = linkPos();
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toBe('/pos');
  });

  test('vendedor ve el botón POS', () => {
    sesionCon('vendedor');
    render(<BottomNav />);
    expect(linkPos()).toBeTruthy();
  });

  test('bodeguero NO ve el botón POS', () => {
    sesionCon('bodeguero');
    render(<BottomNav />);
    expect(linkPos()).toBeNull();
  });

  test('con pos-v1 OFF ningún rol ve el botón POS', () => {
    mockFlags['pos-v1'] = false;
    sesionCon('admin');
    render(<BottomNav />);
    expect(linkPos()).toBeNull();
  });

  test('en /pos el botón queda activo', () => {
    (usePathname as jest.Mock).mockReturnValue('/pos');
    sesionCon('admin');
    render(<BottomNav />);
    const link = linkPos();
    expect(link!.className).toContain('text-[var(--primary)]');
  });

  test('fuera de /pos el botón no queda activo', () => {
    sesionCon('admin');
    render(<BottomNav />);
    expect(linkPos()!.className).not.toContain('text-[var(--primary)]');
  });
});
