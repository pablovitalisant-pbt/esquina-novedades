import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BottomNav } from '@/components/BottomNav';

jest.mock('next/navigation', () => ({ usePathname: () => '/bodega', useSearchParams: () => ({ get: () => null }), useRouter: () => ({ push: jest.fn() }) }));
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { nombre: 'Bodega Test', rol: 'bodeguero' } } }), signOut: jest.fn() }));
jest.mock('@/contexts/AlertasContext', () => ({ useAlertas: () => ({ stockBajoCount: 0 }) }));
jest.mock('@/config/feature-flags.json', () => ({ 'registro_notas_bodega_ui': true }));
jest.mock('next/link', () => ({ children, href }: any) => require('react').createElement('a', { href }, children));

describe('BottomNav bodeguero sin Mis Deudas en sheet Bodega', () => {
  beforeEach(() => { render(<BottomNav />); });
  it('NO muestra pestana Deseados', () => { expect(screen.queryByText('Deseados')).not.toBeInTheDocument(); });
  it('NO muestra pestana Seguimientos', () => { expect(screen.queryByText('Seguimientos')).not.toBeInTheDocument(); });
  describe('sheet Bodega (bodeguero)', () => {
    beforeEach(() => { fireEvent.click(screen.getByText('Bodega')); });
    it('NO contiene Mis Deudas', async () => { await waitFor(() => expect(screen.queryByText('Mis Deudas')).not.toBeInTheDocument()); });
    it('SI contiene Ubicaciones, Registro de Notas (Despachos diferido)', async () => { await waitFor(() => { expect(screen.getByText('Ubicaciones')).toBeInTheDocument(); expect(screen.getByText('Registro de Notas')).toBeInTheDocument(); expect(screen.queryByText('Despachos')).not.toBeInTheDocument(); }); });
  });
  it('NO tiene boton Ventas en la barra', () => { expect(screen.queryByText('Ventas')).not.toBeInTheDocument(); });
});
