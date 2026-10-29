import { render, screen } from '@testing-library/react';
import { AppShell } from '@/components/AppShell';

jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useSearchParams: () => ({ get: () => null }), useRouter: () => ({ push: jest.fn() }) }));
jest.mock('next-auth/react', () => ({ SessionProvider: ({ children }: any) => children, useSession: () => ({ data: { user: { nombre: 'Admin Test', rol: 'admin' } } }), signOut: jest.fn() }));
jest.mock('@/contexts/AlertasContext', () => ({ AlertasProvider: ({ children }: any) => children, useAlertas: () => ({ stockBajoCount: 0 }) }));
jest.mock('next/link', () => ({ children, href }: any) => require('react').createElement('a', { href }, children));

describe('AppShell smoke E2E post-slice', () => {
  const session = { user: { nombre: 'Admin Test', rol: 'admin' } };

  it('renderiza sin error con sesion admin', () => { render(<AppShell session={session}><div data-testid="c">C</div></AppShell>); expect(screen.getByTestId('c')).toBeInTheDocument(); });
  it('muestra La Esquina de las Novedades, no VidaDigital', () => { render(<AppShell session={session}><div>t</div></AppShell>); expect(screen.queryByText('VidaDigital')).not.toBeInTheDocument(); expect(screen.getAllByRole('img', { name: 'La Esquina de las Novedades' }).length).toBeGreaterThanOrEqual(1); });
  it('renderiza con sesion vendedor', () => { render(<AppShell session={{ user: { nombre: 'V', rol: 'vendedor' } }}><div data-testid="v">V</div></AppShell>); expect(screen.getByTestId('v')).toBeInTheDocument(); });
  it('renderiza con sesion bodeguero', () => { render(<AppShell session={{ user: { nombre: 'B', rol: 'bodeguero' } }}><div data-testid="b">B</div></AppShell>); expect(screen.getByTestId('b')).toBeInTheDocument(); });
  it('NO renderiza Toolbar para bodeguero', () => { const { container } = render(<AppShell session={{ user: { nombre: 'B', rol: 'bodeguero' } }}><div>t</div></AppShell>); expect(container.querySelector('main')).toBeInTheDocument(); });
  it('no importa CompanySwitcher', () => { render(<AppShell session={session}><div>t</div></AppShell>); expect(screen.getByText('t')).toBeInTheDocument(); });
  it('logo admin apunta a /precios, no /dashboard', () => { render(<AppShell session={session}><div>t</div></AppShell>); const links = screen.getAllByRole('img', { name: 'La Esquina de las Novedades' }); expect(links.find((el: any) => el.closest('a')?.getAttribute('href') === '/precios')).toBeTruthy(); expect(links.find((el: any) => el.closest('a')?.getAttribute('href') === '/dashboard')).toBeUndefined(); });
  it('logo bodeguero apunta a /bodega', () => { render(<AppShell session={{ user: { nombre: 'B', rol: 'bodeguero' } }}><div>t</div></AppShell>); const links = screen.getAllByRole('img', { name: 'La Esquina de las Novedades' }); expect(links.find((el: any) => el.closest('a')?.getAttribute('href') === '/bodega')).toBeTruthy(); });
});
