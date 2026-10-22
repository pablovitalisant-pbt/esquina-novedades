/**
 * Tests PBT-IA — Slice: Botón Editar Catálogo
 * Estado inicial: ROJO (la funcionalidad no existe aún)
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CatalogoAdminClient } from './client_page';

// --- Mocks globales ---

// useEmpresaId eliminado (PRD §9.17) — componente usa const empresaId = 1

// Mockear la cadena PowerSync: evita importar @powersync/web (Worker no
// definido en jsdom). Flag off por defecto → rama online.
var dbMock: any;
jest.mock('@/lib/powersync/PowerSyncProvider', () => ({
  PowerSyncProvider: ({ children }: any) => children,
}));
jest.mock('@powersync/react', () => ({
  usePowerSync: () => dbMock,
  PowerSyncContext: { Provider: ({ children }: any) => children },
}));
jest.mock('@/config/feature-flags.json', () => ({
  get 'catalogo-admin-offline-lectura'() {
    return (globalThis as any).__catalogoAdminOffline === true;
  },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('next/dynamic', () => () => {
  const Comp = () => null;
  return Comp;
});
// CrearCatalogoDialog (componente aparte, fuera de alcance) → null
jest.mock('@/components/CrearCatalogoDialog', () => ({ CrearCatalogoDialog: () => null }));

const SESSION_OWNER = { user: { id: 'user-1', empresas: [1] } };
const SESSION_OTHER = { user: { id: 'user-2', empresas: [1] } };

const MOCK_CATALOGO = {
  id: 'cat-1',
  titulo: 'Catálogo Test',
  descripcion: 'Desc',
  slug: 'catalogo-test',
  activo: true,
  user_id: 'user-1',
};

const MOCK_ITEMS = [
  { codigo: 'p-1', detalle: 'Producto A', imagen_url: null, precio_catalogo: 100, hide_price: false },
  { codigo: 'p-2', detalle: 'Producto B', imagen_url: null, precio_catalogo: 200, hide_price: false },
];

// Fetch mock base: lista catálogos + detalle con items
function mockFetch(overrides: Record<string, any> = {}) {
  global.fetch = jest.fn().mockImplementation((url: string, opts: any) => {
    // GET lista
    if (url.includes('/api/catalogos?')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [MOCK_CATALOGO] }) });
    }
    // GET publico por slug (usado por el modal de edicion, linea 113 del componente)
    if (url.match(/\/api\/catalogos\/public\/catalogo-test$/)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { productos: MOCK_ITEMS } }) });
    }

    // GET detalle con items
    if (url.match(/\/api\/catalogos\/cat-1$/) && (!opts || opts.method === 'GET' || !opts.method)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { ...MOCK_CATALOGO, items: MOCK_ITEMS } }) });
    }
    // PUT guardar
    if (url.match(/\/api\/catalogos\/cat-1$/) && opts?.method === 'PUT') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ message: 'Catálogo actualizado' }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

beforeEach(() => {
  (globalThis as any).__catalogoAdminOffline = false;
  dbMock = { getAll: jest.fn().mockResolvedValue([]), onChangeWithCallback: jest.fn(() => () => {}) };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

// --- Tests ---

describe('Botón Editar — visibilidad', () => {
  it('muestra el botón Editar al dueño del catálogo', async () => {
    mockFetch();
    render(<CatalogoAdminClient session={SESSION_OWNER} />);
    await waitFor(() => screen.getByText('Catálogo Test'));
    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument();
  });

  it('NO muestra el botón Editar a otro usuario', async () => {
    mockFetch();
    render(<CatalogoAdminClient session={SESSION_OTHER} />);
    await waitFor(() => screen.getByText('Catálogo Test'));
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
  });
});

describe('Modal de edición — apertura y carga', () => {
  it('abre el modal y muestra los productos del catálogo al hacer click en Editar', async () => {
    mockFetch();
    render(<CatalogoAdminClient session={SESSION_OWNER} />);
    await waitFor(() => screen.getByText('Catálogo Test'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    });
    expect(await screen.findByText('Producto A')).toBeInTheDocument();
    expect(screen.getByText('Producto B')).toBeInTheDocument();
  });
});

describe('Modal de edición — eliminar producto', () => {
  it('elimina un producto del listado al hacer click en su ícono de basura', async () => {
    mockFetch();
    render(<CatalogoAdminClient session={SESSION_OWNER} />);
    await waitFor(() => screen.getByText('Catálogo Test'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    });
    expect(await screen.findByText('Producto A')).toBeInTheDocument();

    const trashButtons = screen.getAllByRole('button', { name: /eliminar producto/i });
    fireEvent.click(trashButtons[0]); // elimina Producto A

    await waitFor(() => {
      expect(screen.queryByText('Producto A')).not.toBeInTheDocument();
      expect(screen.getByText('Producto B')).toBeInTheDocument();
    });
  });
});

describe('Modal de edición — guardar cambios', () => {
  it('llama PUT con los items restantes al guardar y cierra el modal', async () => {
    mockFetch();
    render(<CatalogoAdminClient session={SESSION_OWNER} />);
    await waitFor(() => screen.getByText('Catálogo Test'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    });
    expect(await screen.findByText('Producto A')).toBeInTheDocument();

    // Eliminar Producto A
    const trashButtons = screen.getAllByRole('button', { name: /eliminar producto/i });
    fireEvent.click(trashButtons[0]);

    // Guardar
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => {
      const putCall = (global.fetch as jest.Mock).mock.calls.find(
        ([url, opts]: [string, any]) => url.includes('cat-1') && opts?.method === 'PUT'
      );
      expect(putCall).toBeDefined();
      const body = JSON.parse(putCall[1].body);
      // Producto A eliminado → su codigo aparece en palabras_excluir
      expect(body.palabras_excluir).toContain('P-1');
      expect(body.margen_precio).toBe(0);
      expect(body.precio_overrides).toEqual([]);
      // Modal cerrado
      expect(screen.queryByText('Producto A')).not.toBeInTheDocument();
      expect(screen.queryByText('Producto B')).not.toBeInTheDocument();
    });
  });
});

// ─── Slice 18: lectura offline + bloqueo de escritura ───
const OFF_CAT = { id: 'cat-1', titulo: 'Catálogo A', descripcion: 'Desc', slug: 'catalogo-a', activo: '1', user_id: 1, created_at: '2026-08-01' };

describe('catalogo/admin — offline (Slice 18)', () => {
  it('flag en true: fetchCatalogos local mapea activo a boolean real', async () => {
    (globalThis as any).__catalogoAdminOffline = true;
    global.fetch = jest.fn(); // reset: aislar de tests online previos
    dbMock.getAll.mockResolvedValue([OFF_CAT]);
    render(<CatalogoAdminClient session={{ user: { id: 1, rol: 'admin' } }} />);
    await waitFor(() => screen.getByText('Catálogo A'));
    expect(dbMock.getAll).toHaveBeenCalled();
    // el path offline NO llama al endpoint de lista
    const lista = (global.fetch as jest.Mock).mock.calls.filter(([url]: [string]) => String(url).includes('/api/catalogos?'));
    expect(lista.length).toBe(0);
  });

  it('flag en true + offline: eliminar muestra mensaje claro y NO hace fetch', async () => {
    (globalThis as any).__catalogoAdminOffline = true;
    dbMock.getAll.mockResolvedValue([OFF_CAT]);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    global.confirm = jest.fn(() => true) as any;

    render(<CatalogoAdminClient session={{ user: { id: 1, rol: 'admin' } }} />);
    await waitFor(() => screen.getByText('Catálogo A'));
    fireEvent.click(screen.getByLabelText('Eliminar Catálogo A'));

    await waitFor(() => expect(require('sonner').toast.error).toHaveBeenCalled());
    const msg = (require('sonner').toast.error as jest.Mock).mock.calls[0][0] as string;
    expect(msg).toContain('requiere conexión a internet');
    const del = (global.fetch as jest.Mock).mock.calls.filter(
      ([url, opts]: [string, any]) => String(url).includes('/api/catalogos/') && opts?.method === 'DELETE'
    );
    expect(del.length).toBe(0);
  });

  it('flag en true + offline: editar muestra mensaje claro y NO llama a public/[slug]', async () => {
    (globalThis as any).__catalogoAdminOffline = true;
    dbMock.getAll.mockResolvedValue([OFF_CAT]);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    render(<CatalogoAdminClient session={{ user: { id: 1, rol: 'admin' } }} />);
    await waitFor(() => screen.getByText('Catálogo A'));
    fireEvent.click(screen.getByRole('button', { name: /editar/i }));

    await waitFor(() => expect(require('sonner').toast.error).toHaveBeenCalled());
    const msg = (require('sonner').toast.error as jest.Mock).mock.calls[0][0] as string;
    expect(msg).toContain('requiere conexión a internet');
    const pub = (global.fetch as jest.Mock).mock.calls.filter(
      ([url]: [string]) => String(url).includes('/api/catalogos/public/')
    );
    expect(pub.length).toBe(0);
  });
});
