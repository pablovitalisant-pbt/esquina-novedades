import { act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { TopNav } from '@/components/TopNav';

jest.mock('next/link', () => ({ children, href }: any) => require('react').createElement('a', { href }, children));
jest.mock('next/navigation', () => ({
  usePathname: () => '/notas-venta',
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { nombre: 'Pablo Pérez', rol: 'admin' } } }),
  signOut: jest.fn(),
}));
jest.mock('@/contexts/AlertasContext', () => ({ useAlertas: () => ({ stockBajoCount: 0 }) }));
jest.mock('@/components/MarcaLogo', () => ({ MarcaLogo: () => require('react').createElement('span', null, 'LOGO') }));
jest.mock('@/components/AlertasBell', () => ({ AlertasBell: () => require('react').createElement('span', null, 'BELL') }));
jest.mock('@/components/ui/dropdown-menu', () => {
  const r = require('react');
  const Wrap = ({ children }: any) => r.createElement('div', null, children);
  return { DropdownMenu: Wrap, DropdownMenuTrigger: Wrap, DropdownMenuContent: Wrap, DropdownMenuItem: Wrap };
});

describe('TopNav — hidratación (BUG009 N13)', () => {
  let hora = 12;

  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-11-07T12:45:00Z') });
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });
  beforeEach(() => { hora = 12; jest.spyOn(Date.prototype, 'getHours').mockImplementation(() => hora); });
  afterEach(() => { jest.restoreAllMocks(); });
  afterAll(() => { jest.useRealTimers(); });

  it('el primer render es estable en servidor y cliente, y luego saluda Buenos días', async () => {
    // Servidor: 12:45 UTC → con el getSaludo actual diría "Buenas tardes".
    hora = 12;
    const htmlServidor = renderToString(<TopNav />);

    // Cliente: mismo markup inicial aunque el reloj marque las 9 → "Buenos días".
    hora = 9;
    expect(renderToString(<TopNav />)).toBe(htmlServidor);

    // Hidratación real del markup del servidor con el reloj del cliente en 9.
    const container = document.createElement('div');
    container.innerHTML = htmlServidor;
    document.body.appendChild(container);

    const errores: unknown[] = [];
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(container, <TopNav />, {
        onRecoverableError: (e) => errores.push(e),
      });
    });

    expect(errores).toEqual([]);
    // El saludo depende de la hora, así que solo puede aparecer tras el efecto.
    expect(container.textContent).toContain('Buenos días, Pablo');

    await act(async () => { root.unmount(); });
    container.remove();
  });
});
