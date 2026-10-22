/**
 * @jest-environment jsdom
 *
 * FASE B — Fix de impacto lateral: BottomNav (menú móvil) nunca recibió el item
 * "Inversión en Mercadería" en su sheet de Administración (TopNav sí lo tiene).
 * La página solo era alcanzable escribiendo la URL a mano en el celular.
 *
 * Fuerza: con rol admin, el sheet móvil de Administración incluye el link a
 * /admin/inversion-mercaderia.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BottomNav } from '@/components/BottomNav';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { nombre: 'Admin Test', rol: 'admin' } }, status: 'authenticated' }),
  signOut: jest.fn(),
}));
jest.mock('next/navigation', () => ({ usePathname: () => '/' }));

function abrirAdmin() {
  render(<BottomNav />);
  fireEvent.click(screen.getByText('Admin'));
}

describe('BottomNav — sheet Administración: Inversión en Mercadería', () => {
  test('rol admin: incluye el link a /admin/inversion-mercaderia', () => {
    abrirAdmin();
    const link = screen.getByRole('link', { name: /Inversión en Mercadería/i });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toBe('/admin/inversion-mercaderia');
  });
});
