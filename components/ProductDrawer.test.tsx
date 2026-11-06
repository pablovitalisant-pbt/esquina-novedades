import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProductDrawer } from './ProductDrawer';
import { Producto, UserSession } from '@/types';

jest.mock('@/config/feature-flags.json', () => ({
  ...jest.requireActual('@/config/feature-flags.json'),
  'precios-ingreso-stock': false,
}));
const flagsMock = (): Record<string, boolean> => jest.requireMock('@/config/feature-flags.json');

global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(null) });

const mockProducto: Producto = {
  id: 1,
  empresa_id: 1,
  codigo: 'TEST-P',
  detalle: 'Test Product',
  prcventa: 100,
  prcminimo: 80,
  costo: 50,
  margen_pct: 25,
  cif: 40,
  saldo: 10,
  umed: 'UND',
  cantcaja: 1,
  pesocaja: 1,
  cubicaja: 1,
  nroingreso: '2024-001',
  es_nuevo: true,
  categoria: null,
  stock_minimo: null,
  imagen_url: 'http://test.com/image.png',
  fecha_ingreso: new Date(),
  updated_at: new Date()
};

const mockAdmin: UserSession = {
  id: '1',
  rut: '1-1',
  nombre: 'Admin',
  rol: 'admin',
  empresas: [1]
};

const mockUser: UserSession = {
  id: '2',
  rut: '2-2',
  nombre: 'Vendedor',
  rol: 'vendedor',
  empresas: [1]
};

describe('ProductDrawer', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  describe('Image Upload', () => {
    it('shows the image upload button after selecting a file for admin users', () => {
      render(
        <ProductDrawer
          producto={mockProducto}
          session={mockAdmin}
          open={true}
          onOpenChange={() => {}}
          onUpdated={() => {}}
        />
      );

      expect(screen.queryByRole('button', { name: /subir imagen/i })).not.toBeInTheDocument();

      const file = new File(['fake content'], 'test.png', { type: 'image/png' });
      const input = screen.getByTestId('upload-input');

      fireEvent.change(input, { target: { files: [file] } });

      const uploadButton = screen.queryByRole('button', { name: /subir imagen/i });
      expect(uploadButton).toBeInTheDocument();
    });

    it('does not show the upload button for non-admin users', () => {
      render(
        <ProductDrawer
          producto={mockProducto}
          session={mockUser}
          open={true}
          onOpenChange={() => {}}
          onUpdated={() => {}}
        />
      );

      const uploadButton = screen.queryByRole('button', { name: /subir imagen/i });
      expect(uploadButton).not.toBeInTheDocument();
    });
  });

  describe('BUG-019 — Boton Editar y formulario completo', () => {
    it('muestra boton de editar para admin (icono lapiz)', () => {
      render(
        <ProductDrawer
          producto={mockProducto}
          session={mockAdmin}
          open={true}
          onOpenChange={() => {}}
          onUpdated={() => {}}
        />
      );

      const editButton = screen.queryByTitle('Editar producto');
      expect(editButton).toBeInTheDocument();
    });

    it('al hacer clic en editar muestra inputs directos de precio (sin % de ganancia)', () => {
      render(
        <ProductDrawer
          producto={mockProducto}
          session={mockAdmin}
          open={true}
          onOpenChange={() => {}}
          onUpdated={() => {}}
        />
      );

      const editButton = screen.getByTitle('Editar producto');
      fireEvent.click(editButton);

      expect(screen.queryByText('Precio por menor *')).toBeInTheDocument();
      expect(screen.queryByText(/% Ganancia/)).toBeNull();
    });

    it('al cancelar la edicion vuelve al modo lectura', () => {
      render(
        <ProductDrawer
          producto={mockProducto}
          session={mockAdmin}
          open={true}
          onOpenChange={() => {}}
          onUpdated={() => {}}
        />
      );

      fireEvent.click(screen.getByTitle('Editar producto'));
      expect(screen.queryByText('Precio por menor *')).toBeInTheDocument();

      fireEvent.click(screen.getByText(/cancelar/i));
      expect(screen.queryByText('Precio por menor *')).not.toBeInTheDocument();
    });

    it('precio de venta se muestra en tabla modo lectura', () => {
      render(
        <ProductDrawer
          producto={mockProducto}
          session={mockAdmin}
          open={true}
          onOpenChange={() => {}}
          onUpdated={() => {}}
        />
      );

      expect(screen.queryByText('Precio por menor')).toBeInTheDocument();
    });

    it('handleSaveProduct hace fetch a /api/productos/[id] con id real (BUG-019 fix)', () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: mockProducto }),
      });

      render(
        <ProductDrawer
          producto={mockProducto}
          session={mockAdmin}
          open={true}
          onOpenChange={() => {}}
          onUpdated={() => {}}
        />
      );

      fireEvent.click(screen.getByTitle('Editar producto'));
      fireEvent.click(screen.getByText(/guardar/i));

      // La URL debe contener el id real del producto, no el template literal escapado
      const fetchCall = (global.fetch as jest.Mock).mock.calls.find(
        (call: any[]) => call[0]?.includes('/api/productos/')
      );
      expect(fetchCall).toBeDefined();
      expect(fetchCall[0]).toContain('/api/productos/1');
      expect(fetchCall[0]).not.toContain('${');
    });
  });

  describe('Costo NULL — edicion directa', () => {
    const legacyProducto = { ...mockProducto, costo: null as any, margen_pct: null };

    it('permite editar precio directo cuando costo es null — PUT sin costo/margen', () => {
      let capturedBody: any = null;
      (global.fetch as jest.Mock).mockImplementation((url: string, opts: any) => {
        if (opts?.body) {
          try { capturedBody = JSON.parse(opts.body); } catch {}
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: legacyProducto }),
        });
      });

      render(
        <ProductDrawer
          producto={legacyProducto}
          session={mockAdmin}
          open={true}
          onOpenChange={() => {}}
          onUpdated={() => {}}
        />
      );

      fireEvent.click(screen.getByTitle('Editar producto'));

      // Precio directo editable aunque no haya costo
      const priceInput = screen.getByTestId('edit-precio-detalle') as HTMLInputElement;
      expect(priceInput).toBeInTheDocument();

      // Cambia el precio a un valor nuevo
      fireEvent.change(priceInput, { target: { value: '75' } });

      // Guarda
      fireEvent.click(screen.getByText(/guardar/i));

      // Verifica que el PUT body contiene prcventa pero NO costo ni margen_pct
      expect(capturedBody).not.toBeNull();
      expect(capturedBody.prcventa).toBe(75);
      expect(capturedBody.costo).toBeUndefined();
      expect(capturedBody.margen_pct).toBeUndefined();
    });
  });

  describe('Share con precio', () => {
    const renderShare = (
      overrides: Partial<Producto> = {},
      props: { ocultarPrecios?: boolean } = {}
    ) => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        blob: jest.fn().mockResolvedValue(new Blob(['img'], { type: 'image/jpeg' })),
      });
      const mockShare = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'share', { value: mockShare, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });

      render(
        <ProductDrawer
          producto={{ ...mockProducto, ...overrides }}
          session={mockAdmin}
          open={true}
          onOpenChange={() => {}}
          onUpdated={() => {}}
          ocultarPrecios={props.ocultarPrecios}
        />
      );
      return mockShare;
    };

    const clickShare = async (mockShare: jest.Mock) => {
      fireEvent.click(screen.getByRole('button', { name: /compartir imagen/i }));
      await waitFor(() => expect(mockShare).toHaveBeenCalled());
    };

    it('prcventa=12345 → solo línea de precio CLP', async () => {
      const mockShare = renderShare({ prcventa: 12345 });
      await clickShare(mockShare);
      expect(mockShare.mock.calls[0][0]).toEqual(expect.objectContaining({
        text: '$12.345',
      }));
    });

    it('prcventa=0 → sin text', async () => {
      const mockShare = renderShare({ prcventa: 0 });
      await clickShare(mockShare);
      expect(mockShare.mock.calls[0][0].text).toBeUndefined();
    });

    it('ocultarPrecios=true → sin text aunque haya precio y dólar', async () => {
      const mockShare = renderShare({ prcventa: 20 }, { ocultarPrecios: true });
      await clickShare(mockShare);
      expect(mockShare.mock.calls[0][0].text).toBeUndefined();
    });
  });

  describe('N10 — empaque sin peso ni cubicaje', () => {
    const productoEmpaque = { ...mockProducto, cantcaja: 12, pesocaja: 3.5, cubicaja: 0.02 };
    const renderEmpaque = () => render(
      <ProductDrawer producto={productoEmpaque} session={mockAdmin} open={true} onOpenChange={() => {}} onUpdated={() => {}} />
    );

    it('muestra unidades por caja y oculta peso/cubicaje en lectura', () => {
      renderEmpaque();
      expect(screen.getByText('12 UND/Caja')).toBeInTheDocument();
      expect(screen.queryByText(/kg ·/)).toBeNull();
      expect(screen.queryByText(/m³/)).toBeNull();
    });

    it('al editar mantiene cantidad por caja y el PUT omite peso/cubicaje', () => {
      let capturedBody: any = null;
      (global.fetch as jest.Mock).mockImplementation((url: string, opts: any) => {
        if (opts?.body) { try { capturedBody = JSON.parse(opts.body); } catch {} }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: productoEmpaque }) });
      });
      renderEmpaque();
      fireEvent.click(screen.getByTitle('Editar producto'));
      expect((screen.getByPlaceholderText('Cant/caja') as HTMLInputElement).value).toBe('12');
      expect(screen.queryByText(/Peso por caja/)).toBeNull();
      expect(screen.queryByText(/Cubicaje por caja/)).toBeNull();
      fireEvent.click(screen.getByText(/guardar/i));
      expect(capturedBody.cantcaja).toBe(12);
      expect(capturedBody.pesocaja).toBeUndefined();
      expect(capturedBody.cubicaja).toBeUndefined();
    });
  });

  describe('N11b — ingreso desde el cajon de precios', () => {
    const renderConAdmin = (producto: Producto, onUpdated = jest.fn()) => render(
      <ProductDrawer producto={producto} session={mockAdmin} open={true} onOpenChange={() => {}} onUpdated={onUpdated} />
    );

    beforeEach(() => {
      (global.fetch as jest.Mock).mockReset();
      (global.fetch as jest.Mock).mockImplementation(async (url: string, opts?: any) => (
        String(url).includes('/api/ingresos') && opts?.method === 'POST'
          ? { ok: true, json: async () => ({ saldo_actual: 210, cantcaja_actual: 12 }) }
          : { ok: true, json: async () => [] }
      ));
    });

    afterEach(() => { flagsMock()['precios-ingreso-stock'] = false; });

    it('flag apagado por defecto: admin no ve Ingresar mercaderia', () => {
      renderConAdmin(mockProducto);
      expect(screen.queryByRole('button', { name: /ingresar mercader[ií]a/i })).toBeNull();
    });

    it('flag encendido: abre formulario precargado y registra POST una vez', async () => {
      flagsMock()['precios-ingreso-stock'] = true;
      const onUpdated = jest.fn();
      renderConAdmin(mockProducto, onUpdated);
      expect(screen.getByRole('button', { name: /ingresar mercader[ií]a/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /ingresar mercader[ií]a/i }));
      const cantidad = screen.getByPlaceholderText('Ej: 200');
      fireEvent.change(cantidad, { target: { value: '200' } });
      fireEvent.click(screen.getByRole('button', { name: /registrar ingreso/i }));
      await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
      const posts = (global.fetch as jest.Mock).mock.calls.filter(
        ([u, o]: any[]) => String(u).includes('/api/ingresos') && o?.method === 'POST'
      );
      expect(posts).toHaveLength(1);
      expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ saldo: 210, cantcaja: 12 }));
    });

    it('producto de otra empresa: admin no ve Ingresar mercaderia', () => {
      flagsMock()['precios-ingreso-stock'] = true;
      renderConAdmin({ ...mockProducto, empresa_id: 2 });
      expect(screen.queryByRole('button', { name: /ingresar mercader[ií]a/i })).toBeNull();
    });
  });
});
