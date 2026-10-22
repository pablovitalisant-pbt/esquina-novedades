/**
 * @jest-environment jsdom
 *
 * FASE B — Fix de impacto lateral: BottomNav (menú móvil) nunca recibió el item
 * "Inversión en Mercadería" en su sheet de Administración (TopNav sí lo tiene).
 * La página solo era alcanzable escribiendo la URL a mano en el celular.
 *
 * Fuerza: con rol admin y flag inversion-mercaderia true, el sheet móvil de
 * Administración incluye el link a /admin/inversion-mercaderia; con flag false,
 * NO debe aparecer (gateado igual que TopNav).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BottomNav } from '@/components/BottomNav';

let flagOn = true;
jest.mock('@/config/feature-flags.json', () => ({
  get 'inversion-mercaderia'() { return flagOn; },
}));
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
  test('1 — rol admin + flag true: incluye el link a /admin/inversion-mercaderia', () => {
    flagOn = true;
    abrirAdmin();
    const link = screen.getByRole('link', { name: /Inversión en Mercadería/i });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toBe('/admin/inversion-mercaderia');
  });

  test('2 — con flag false, el link NO aparece (gateado como en TopNav)', () => {
    flagOn = false;
    abrirAdmin();
    expect(screen.queryByRole('link', { name: /Inversión en Mercadería/i })).toBeNull();
    // Los demás items del sheet siguen estando
    expect(screen.getByRole('link', { name: /Usuarios/i })).toBeInTheDocument();
  });
});
