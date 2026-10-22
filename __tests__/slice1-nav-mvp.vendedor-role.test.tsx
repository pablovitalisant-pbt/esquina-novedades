import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BottomNav } from '@/components/BottomNav';

jest.mock('next/navigation', () => ({ usePathname: () => '/precios', useSearchParams: () => ({ get: () => null }), useRouter: () => ({ push: jest.fn() }) }));
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { nombre: 'Vendedor Test', rol: 'vendedor' } } }), signOut: jest.fn() }));
jest.mock('@/contexts/AlertasContext', () => ({ useAlertas: () => ({ stockBajoCount: 0 }) }));
jest.mock('next/link', () => ({ children, href }: any) => require('react').createElement('a', { href }, children));

describe('BottomNav vendedor sin modulos excluidos', () => {
  beforeEach(() => { render(<BottomNav />); });
  it('NO muestra pestana Deseados', () => { expect(screen.queryByText('Deseados')).not.toBeInTheDocument(); });
  it('NO muestra pestana Seguimientos', () => { expect(screen.queryByText('Seguimientos')).not.toBeInTheDocument(); });
  describe('sheet Ventas (vendedor)', () => {
    beforeEach(() => { fireEvent.click(screen.getByText('Ventas')); });
    it('NO contiene Garantias, WinFac, Pre-Notas, Clientes Nuevos, Mis Deudas', async () => { await waitFor(() => { expect(screen.queryByText('Garantías')).not.toBeInTheDocument(); expect(screen.queryByText('Sincronizar WinFac')).not.toBeInTheDocument(); expect(screen.queryByText('Pre-Notas')).not.toBeInTheDocument(); expect(screen.queryByText('Clientes Nuevos')).not.toBeInTheDocument(); expect(screen.queryByText('Mis Deudas')).not.toBeInTheDocument(); }); });
    it('SI contiene Sala de Venta y NO Caja Mayor (permisos por rol)', async () => { await waitFor(() => { expect(screen.getByText('Sala de Venta')).toBeInTheDocument(); expect(screen.queryByText('Caja Mayor')).not.toBeInTheDocument(); }); });
  });
  describe('sheet Catalogo (vendedor)', () => {
    beforeEach(() => { fireEvent.click(screen.getByText('Catálogo')); });
    it('NO contiene Catalogos por Cliente ni Pedir a China', async () => { await waitFor(() => { expect(screen.queryByText('Catálogos por Cliente')).not.toBeInTheDocument(); expect(screen.queryByText('Pedir a China')).not.toBeInTheDocument(); }); });
  });
  it('SI contiene Categorías (permisos por rol)', async () => { await waitFor(() => { expect(screen.getByText('Categorías')).toBeInTheDocument(); }); });
  describe('sheet Bodega (vendedor)', () => {
    beforeEach(() => { fireEvent.click(screen.getByText('Bodega')); });
    it('NO contiene Mis Deudas', async () => { await waitFor(() => expect(screen.queryByText('Mis Deudas')).not.toBeInTheDocument()); });
  });
});
