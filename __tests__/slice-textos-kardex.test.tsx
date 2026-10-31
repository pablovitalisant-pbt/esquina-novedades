/**
 * Fase B — Slice textos-kardex: /productos ya no es una pagina de la tienda
 * (redirige 308 a /) y Kardex Cliente no se ofrece en los menus.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TopNav } from '@/components/TopNav';
import { BottomNav } from '@/components/BottomNav';
import { PedidosPage } from '@/app/(app)/pedidos/client_page';

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { nombre: 'Admin Test', rol: 'admin' } } }),
  signOut: jest.fn(),
}));
jest.mock('@/contexts/AlertasContext', () => ({ useAlertas: () => ({ stockBajoCount: 0 }) }));
jest.mock('@/config/feature-flags.json', () =>
  require('@/__tests__/helpers/mockFlags').mockFlags({ 'registro_notas_bodega_ui': true })
);
jest.mock('next/link', () => ({ children, href }: any) => require('react').createElement('a', { href }, children));
jest.mock('sonner', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), warning: jest.fn() }),
}));

const session = { user: { nombre: 'Admin Test', rol: 'admin' } } as any;

describe('Pedidos — subtitulo sin /productos', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }) as any;
  });

  it('muestra el texto de tienda online y catalogos', async () => {
    render(<PedidosPage session={session} />);
    await waitFor(() =>
      expect(
        screen.getByText('Pedidos recibidos desde la tienda online y los catálogos')
      ).toBeInTheDocument()
    );
    expect(screen.queryByText(/\/productos/)).not.toBeInTheDocument();
  });
});

function hrefs(): (string | null)[] {
  return screen.queryAllByRole('link').map((a) => a.getAttribute('href'));
}

describe('Menus — sin enlace a Kardex Cliente', () => {
  it('TopNav (dropdown Ventas) no enlaza /ventas/kardex', () => {
    render(<TopNav />);
    fireEvent.mouseEnter(screen.getByText('Ventas'));
    expect(hrefs()).not.toContain('/ventas/kardex');
  });

  it('BottomNav (sheet Ventas) no enlaza /ventas/kardex', () => {
    render(<BottomNav />);
    fireEvent.click(screen.getByText('Ventas'));
    expect(hrefs()).not.toContain('/ventas/kardex');
  });
});
