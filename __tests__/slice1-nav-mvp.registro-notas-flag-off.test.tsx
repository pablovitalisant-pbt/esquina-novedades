import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TopNav } from '@/components/TopNav';
import { BottomNav } from '@/components/BottomNav';

jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useSearchParams: () => ({ get: () => null }), useRouter: () => ({ push: jest.fn() }) }));
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { nombre: 'Admin Test', rol: 'admin' } } }), signOut: jest.fn() }));
jest.mock('@/contexts/AlertasContext', () => ({ useAlertas: () => ({ stockBajoCount: 0 }) }));
jest.mock('@/config/feature-flags.json', () => ({ 'registro_notas_bodega_ui': false }));
jest.mock('next/link', () => ({ children, href }: any) => require('react').createElement('a', { href }, children));

const openDropdown = (l: string) => { fireEvent.mouseEnter(screen.getByText(l)); };
const openSheet = (l: string) => { fireEvent.click(screen.getByText(l)); };

describe('TopNav — flag registro_notas_bodega_ui=false', () => {
  beforeEach(() => { render(<TopNav />); });
  describe('dropdown Bodega', () => {
    beforeEach(() => openDropdown('Bodega'));
    it('NO contiene Registro de Notas cuando flag=false', async () => {
      await waitFor(() => {
        expect(screen.getByText('Ubicaciones')).toBeInTheDocument();
        expect(screen.queryByText('Registro de Notas')).not.toBeInTheDocument();
      });
    });
  });
});

describe('BottomNav — flag registro_notas_bodega_ui=false', () => {
  beforeEach(() => { render(<BottomNav />); });
  describe('sheet Bodega', () => {
    beforeEach(() => openSheet('Bodega'));
    it('NO contiene Registro de Notas cuando flag=false', async () => {
      await waitFor(() => {
        expect(screen.getByText('Ubicaciones')).toBeInTheDocument();
        expect(screen.queryByText('Registro de Notas')).not.toBeInTheDocument();
      });
    });
  });
});
