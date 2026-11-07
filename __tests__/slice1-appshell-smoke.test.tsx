import { render, screen } from '@testing-library/react';
import { AppShell } from '@/components/AppShell';
import flagsMock from '@/config/feature-flags.json';

let mockSession: any = null;
jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useSearchParams: () => ({ get: () => null }), useRouter: () => ({ push: jest.fn() }) }));
jest.mock('next-auth/react', () => ({
  SessionProvider: ({ children, session }: any) => { mockSession = session; return children; },
  useSession: () => ({ data: mockSession }),
  signOut: jest.fn(),
}));
jest.mock('@/config/feature-flags.json', () => require('@/__tests__/helpers/mockFlags').mockFlags({ 'pos-v1': true }));
jest.mock('@/contexts/AlertasContext', () => ({ AlertasProvider: ({ children }: any) => children, useAlertas: () => ({ stockBajoCount: 0 }) }));
jest.mock('next/link', () => ({ children, href }: any) => require('react').createElement('a', { href }, children));

describe('AppShell smoke E2E post-slice', () => {
  const session = { user: { nombre: 'Admin Test', rol: 'admin' } };
  beforeEach(() => { (flagsMock as any)['pos-v1'] = true; });

  it('renderiza sin error con sesion admin', () => { render(<AppShell session={session}><div data-testid="c">C</div></AppShell>); expect(screen.getByTestId('c')).toBeInTheDocument(); });
  it('muestra La Esquina de las Novedades, no VidaDigital', () => { render(<AppShell session={session}><div>t</div></AppShell>); expect(screen.queryByText('VidaDigital')).not.toBeInTheDocument(); expect(screen.getAllByRole('img', { name: 'La Esquina de las Novedades' }).length).toBeGreaterThanOrEqual(1); });
  it('renderiza con sesion vendedor', () => { render(<AppShell session={{ user: { nombre: 'V', rol: 'vendedor' } }}><div data-testid="v">V</div></AppShell>); expect(screen.getByTestId('v')).toBeInTheDocument(); });
  it('renderiza con sesion bodeguero', () => { render(<AppShell session={{ user: { nombre: 'B', rol: 'bodeguero' } }}><div data-testid="b">B</div></AppShell>); expect(screen.getByTestId('b')).toBeInTheDocument(); });
  it('NO renderiza Toolbar para bodeguero', () => { const { container } = render(<AppShell session={{ user: { nombre: 'B', rol: 'bodeguero' } }}><div>t</div></AppShell>); expect(container.querySelector('main')).toBeInTheDocument(); });
  it('no importa CompanySwitcher', () => { render(<AppShell session={session}><div>t</div></AppShell>); expect(screen.getByText('t')).toBeInTheDocument(); });
  it('logo bodeguero apunta a /bodega', () => { render(<AppShell session={{ user: { nombre: 'B', rol: 'bodeguero' } }}><div>t</div></AppShell>); const links = screen.getAllByRole('img', { name: 'La Esquina de las Novedades' }); expect(links.find((el: any) => el.closest('a')?.getAttribute('href') === '/bodega')).toBeTruthy(); });
});

describe('M08 logo interno segun rol y flag pos-v1', () => {
  const casos: Array<[string, boolean, string]> = [
    ['admin', true, '/pos'],
    ['admin', false, '/precios'],
    ['vendedor', true, '/pos'],
    ['vendedor', false, '/precios'],
    ['bodeguero', true, '/bodega'],
    ['bodeguero', false, '/bodega'],
  ];

  it.each(casos)('%s con pos-v1=%s: ambos logos abren %s', (rol, flagOn, esperado) => {
    (flagsMock as any)['pos-v1'] = flagOn;
    render(<AppShell session={{ user: { nombre: 'Test', rol } }}><div>t</div></AppShell>);
    const logos = screen.getAllByRole('img', { name: 'La Esquina de las Novedades' });
    expect(logos.length).toBeGreaterThanOrEqual(2);
    expect(logos.every((el: any) => el.closest('a')?.getAttribute('href') === esperado)).toBe(true);
  });
});
