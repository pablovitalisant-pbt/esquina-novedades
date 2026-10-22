/**
 * Fase B — Slice 3: Test de comportamiento real del BottomNav
 * con pathname /notas-venta. Verifica que el renderizado condicional
 * por ruta aplica la clase activa correctamente.
 */

import { render, screen } from '@testing-library/react';
import { BottomNav } from '@/components/BottomNav';

jest.mock('next/navigation', () => ({
  usePathname: () => '/notas-venta',
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { nombre: 'Test', rol: 'admin' } } }),
  signOut: jest.fn(),
}));

jest.mock('@/contexts/AlertasContext', () => ({
  useAlertas: () => ({ stockBajoCount: 0 }),
}));

jest.mock('next/link', () => ({ children, href }: any) =>
  require('react').createElement('a', { href }, children)
);

describe('BottomNav — ícono Ventas activo en /notas-venta', () => {
  beforeEach(() => {
    render(<BottomNav />);
  });

  it('el botón Ventas tiene la clase activa cuando pathname es /notas-venta', () => {
    const ventasSpan = screen.getByText('Ventas');
    const ventasBtn = ventasSpan.closest('button')!;
    expect(ventasBtn.className).toContain('text-[var(--primary)]');
  });

  it('el botón Ventas NO tiene clase inactiva', () => {
    const ventasSpan = screen.getByText('Ventas');
    const ventasBtn = ventasSpan.closest('button')!;
    expect(ventasBtn.className).not.toContain('text-[var(--body)]');
  });
});
