import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BottomNav } from '@/components/BottomNav';

jest.mock('next/navigation', () => ({ usePathname: () => '/bodega', useSearchParams: () => ({ get: () => null }), useRouter: () => ({ push: jest.fn() }) }));
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { nombre: 'Bodega Test', rol: 'bodeguero' } } }), signOut: jest.fn() }));
jest.mock('@/contexts/AlertasContext', () => ({ useAlertas: () => ({ stockBajoCount: 0 }) }));
jest.mock('@/config/feature-flags.json', () => ({ 'registro_notas_bodega_ui': false }));
jest.mock('next/link', () => ({ children, href }: any) => require('react').createElement('a', { href }, children));

describe('BottomNav bodeguero — flag registro_notas_bodega_ui=false', () => {
  beforeEach(() => { render(<BottomNav />); });
  describe('sheet Bodega (bodeguero)', () => {
    beforeEach(() => { fireEvent.click(screen.getByText('Bodega')); });
    it('NO contiene Registro de Notas cuando flag=false', async () => {
      await waitFor(() => {
        expect(screen.getByText('Ubicaciones')).toBeInTheDocument();
        expect(screen.queryByText('Registro de Notas')).not.toBeInTheDocument();
      });
    });
  });
});
