import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TopNav } from '@/components/TopNav';
import { BottomNav } from '@/components/BottomNav';

jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useSearchParams: () => ({ get: () => null }), useRouter: () => ({ push: jest.fn() }) }));
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { nombre: 'Admin Test', rol: 'admin' } } }), signOut: jest.fn() }));
jest.mock('@/contexts/AlertasContext', () => ({ useAlertas: () => ({ stockBajoCount: 0 }) }));
jest.mock('@/config/feature-flags.json', () => ({ 'registro_notas_bodega_ui': true }));
jest.mock('next/link', () => ({ children, href }: any) => require('react').createElement('a', { href }, children));

const openDropdown = (l: string) => { fireEvent.mouseEnter(screen.getByText(l)); };
const openSheet = (l: string) => { fireEvent.click(screen.getByText(l)); };

describe('TopNav — solo MVP (dropdowns abiertos)', () => {
  beforeEach(() => { render(<TopNav />); });

  describe('dropdown Ventas', () => {
    beforeEach(() => openDropdown('Ventas'));
    it('NO contiene Sincronizar WinFac', async () => { await waitFor(() => expect(screen.queryByText('Sincronizar WinFac')).not.toBeInTheDocument()); });
    it('SI contiene Sala de Venta', async () => { await waitFor(() => { expect(screen.getByText('Sala de Venta')).toBeInTheDocument(); }); });
    it('NO contiene Kardex Cliente (diferido)', async () => { await waitFor(() => expect(screen.queryByText('Kardex Cliente')).not.toBeInTheDocument()); });
  });
  describe('dropdown Catálogo', () => {
    beforeEach(() => openDropdown('Catálogo'));
    it('NO contiene Catálogos por Cliente', async () => { await waitFor(() => expect(screen.queryByText('Catálogos por Cliente')).not.toBeInTheDocument()); });
    it('Catálogo es link directo', async () => { await waitFor(() => { expect(screen.getByText('Catálogo')).toBeInTheDocument(); }); });
  });
  describe('dropdown Bodega', () => {
    beforeEach(() => openDropdown('Bodega'));
    it('SI contiene los 2 sub-items (Despachos diferido)', async () => { await waitFor(() => { expect(screen.getByText('Ubicaciones')).toBeInTheDocument(); expect(screen.getByText('Registro de Notas')).toBeInTheDocument(); expect(screen.queryByText('Despachos')).not.toBeInTheDocument(); }); });
  });
  describe('dropdown Administración', () => {
    beforeEach(() => openDropdown('Administración'));
    it('NO contiene WinFac, Subir Imagenes, Exclusiones', async () => { await waitFor(() => { expect(screen.queryByText('Sincronizar WinFac')).not.toBeInTheDocument(); expect(screen.queryByText('Subir Imágenes')).not.toBeInTheDocument(); expect(screen.queryByText('Exclusiones Kardex')).not.toBeInTheDocument(); }); });
    it('SI contiene Usuarios y Config de Caja', async () => { await waitFor(() => { expect(screen.getByText('Usuarios')).toBeInTheDocument(); expect(screen.getByText('Config de Caja')).toBeInTheDocument(); }); });
  });
  it('NO contiene enlaces directos a Garantias, Deudas, Sueldos, Seguimientos', () => { expect(screen.queryByText('GARANTÍAS')).not.toBeInTheDocument(); expect(screen.queryByText('Deudas')).not.toBeInTheDocument(); expect(screen.queryByText('Sueldos')).not.toBeInTheDocument(); expect(screen.queryByText('Seguimientos')).not.toBeInTheDocument(); });
  it('wordmark dice La Esquina de las Novedades y apunta a /precios', () => { expect(screen.queryByText('VidaDigital')).not.toBeInTheDocument(); const logo = screen.getByText('La Esquina de las Novedades'); expect(logo.closest('a')?.getAttribute('href')).toBe('/precios'); });
});

describe('BottomNav — solo MVP (sheets abiertos)', () => {
  beforeEach(() => { render(<BottomNav />); });
  it('NO muestra pestana Deseados', () => { expect(screen.queryByText('Deseados')).not.toBeInTheDocument(); });
  it('NO muestra pestana Seguimientos', () => { expect(screen.queryByText('Seguimientos')).not.toBeInTheDocument(); });

  describe('sheet Ventas', () => {
    beforeEach(() => openSheet('Ventas'));
    it('NO contiene WinFac, Garantias, Pre-Notas, Clientes Nuevos, Mis Deudas', async () => { await waitFor(() => { expect(screen.queryByText('Sincronizar WinFac')).not.toBeInTheDocument(); expect(screen.queryByText('Garantías')).not.toBeInTheDocument(); expect(screen.queryByText('Pre-Notas')).not.toBeInTheDocument(); expect(screen.queryByText('Clientes Nuevos')).not.toBeInTheDocument(); expect(screen.queryByText('Mis Deudas')).not.toBeInTheDocument(); }); });
    it('SI contiene Sala de Venta y Caja Mayor (Kardex diferido)', async () => { await waitFor(() => { expect(screen.getByText('Sala de Venta')).toBeInTheDocument(); expect(screen.getByText('Caja Mayor')).toBeInTheDocument(); }); });
  });
  describe('sheet Catálogo', () => {
    beforeEach(() => openSheet('Catálogo'));
    it('NO contiene Catálogos por Cliente ni Pedir a China', async () => { await waitFor(() => { expect(screen.queryByText('Catálogos por Cliente')).not.toBeInTheDocument(); expect(screen.queryByText('Pedir a China')).not.toBeInTheDocument(); }); });
    it('Catálogo es link directo', async () => { await waitFor(() => { expect(screen.getByText('Catálogo')).toBeInTheDocument(); }); });
  });
  describe('sheet Bodega', () => {
    beforeEach(() => openSheet('Bodega'));
    it('NO contiene Mis Deudas', async () => { await waitFor(() => expect(screen.queryByText('Mis Deudas')).not.toBeInTheDocument()); });
    it('SI contiene Ubicaciones, Registro de Notas (Despachos diferido)', async () => { await waitFor(() => { expect(screen.getByText('Ubicaciones')).toBeInTheDocument(); expect(screen.getByText('Registro de Notas')).toBeInTheDocument(); expect(screen.queryByText('Despachos')).not.toBeInTheDocument(); }); });
  });
  describe('sheet Admin', () => {
    beforeEach(() => openSheet('Admin'));
    it('NO contiene WinFac, Subir Imagenes, Exclusiones, Sueldos, Deudas', async () => { await waitFor(() => { expect(screen.queryByText('Sincronizar WinFac')).not.toBeInTheDocument(); expect(screen.queryByText('Subir Imágenes')).not.toBeInTheDocument(); expect(screen.queryByText('Exclusiones Kardex')).not.toBeInTheDocument(); expect(screen.queryByText('Sueldos')).not.toBeInTheDocument(); expect(screen.queryByText('Deudas')).not.toBeInTheDocument(); }); });
  });
});

describe('Toolbar eliminado — items ahora en TopNav VENTAS ▾', () => {
  it('TopNav NO contiene modulos excluidos del MVP', () => {
    const fs = require('fs');
    const content = fs.readFileSync(require('path').resolve(__dirname, '..', 'components/TopNav.tsx'), 'utf-8');
    expect(content).not.toMatch(/Deseados|China|Clientes Nuevos|Deudas|Sueldos|Seguimientos|GARANTÍAS|Pre-notas/);
  });
});
