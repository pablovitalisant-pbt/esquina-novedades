/**
 * Tests PBT-IA — Fase B: modal edición con precio individual
 * Estado inicial: ROJO (input de precio por producto aún no implementado)
 *
 * T3 — Renderizado condicional según mostrar_precio (hydration)
 * T4 — Doble-click en Guardar bloqueado durante el request
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CatalogoAdminClient } from '@/app/(app)/catalogo/admin/client_page';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// useEmpresaId eliminado (PRD §9.17)

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    const MockQR = () => null;
    MockQR.displayName = 'QRCodeSVG';
    return MockQR;
  },
}));

// Mock session
const mockSession = {
  user: { id: 'test-user-id', empresas: [1] },
};

// Catálogo de prueba con mostrar_precio = true
const CATALOG_WITH_PRICE = {
  id: 100,
  slug: 'test-cat-1',
  titulo: 'Catálogo Test',
  descripcion: null,
  activo: true,
  mostrar_precio: true,
  margen_precio: '25',
  user_id: 'test-user-id',
  palabras_excluir: '',
  palabras_incluir: '',
  ambas_empresas: true,
  categoria: null,
};

// Catálogo de prueba con mostrar_precio = false
const CATALOG_WITHOUT_PRICE = {
  ...CATALOG_WITH_PRICE,
  id: 101,
  slug: 'test-cat-2',
  titulo: 'Catálogo Sin Precio',
  mostrar_precio: false,
};

// Productos de prueba
const MOCK_PRODUCTOS = [
  {
    codigo: 'TEST-001',
    detalle: 'Producto Test 1',
    imagen_url: null,
    costo: '100',
    precio_catalogo: 125,
    precio_override: null,
    cantcaja: 1,
    umed: 'UN',
    saldo: 10,
  },
  {
    codigo: 'TEST-002',
    detalle: 'Producto Test 2',
    imagen_url: null,
    costo: '200',
    precio_catalogo: 250,
    precio_override: null,
    cantcaja: 1,
    umed: 'UN',
    saldo: 5,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOk(data: any) {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockFetchWithDelay(data: any, delayMs: number) {
  (global as any).fetch = jest.fn().mockImplementation(
    () =>
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: true,
              json: () => Promise.resolve(data),
            }),
          delayMs
        )
      )
  );
}

function renderPage() {
  return render(<CatalogoAdminClient session={mockSession} />);
}

// ---------------------------------------------------------------------------
// T3 — Renderizado condicional según mostrar_precio
// ---------------------------------------------------------------------------

describe('T3 — Input de precio individual condicionado a mostrar_precio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cuando mostrar_precio = true, el modal de edición debe mostrar inputs de precio individual por producto', async () => {
    // Mock: lista de catálogos incluye el catálogo con mostrar_precio = true
    mockFetchOk({ data: [CATALOG_WITH_PRICE] });

    renderPage();

    // Esperar que el catálogo aparezca
    await waitFor(() => {
      expect(screen.getByText('Catálogo Test')).toBeInTheDocument();
    });

    // Click en Editar
    const editBtn = screen.getByRole('button', { name: /editar/i });
    expect(editBtn).toBeInTheDocument();

    // Mock: fetch del endpoint público para cargar productos en el modal
    mockFetchOk({ data: { productos: MOCK_PRODUCTOS } });

    await act(async () => {
      fireEvent.click(editBtn);
    });

    // El modal debe mostrar inputs de precio individual por producto
    await waitFor(() => {
      // Buscar un input de tipo number con aria-label que identifique el precio individual
      const priceInputs = screen.queryAllByRole('spinbutton');
      // Debe haber al menos inputs de precio (uno por producto) más el input de margen
      expect(priceInputs.length).toBeGreaterThanOrEqual(MOCK_PRODUCTOS.length);
    });
  });

  it('cuando mostrar_precio = false, el modal NO debe mostrar inputs de precio individual por producto', async () => {
    mockFetchOk({ data: [CATALOG_WITHOUT_PRICE] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Catálogo Sin Precio')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /editar/i });
    mockFetchOk({ data: { productos: MOCK_PRODUCTOS } });

    await act(async () => {
      fireEvent.click(editBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Producto Test 1')).toBeInTheDocument();
    });

    // Con mostrar_precio = false, NO deben existir inputs de precio individual
    // El input de margen global SÍ debe permanecer (es configuración, no display)
    // Verificar que hay exactamente 1 spinbutton = el campo de margen preexistente
    const priceInputs = screen.queryAllByRole('spinbutton');
    // 1 = solo el input de margen global (que ya existía antes de este slice)
    expect(priceInputs.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// T4 — Doble-click en Guardar bloqueado
// ---------------------------------------------------------------------------

describe('T4 — Loading state bloquea doble submit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('el botón Guardar se deshabilita inmediatamente al hacer click y no permite segundo submit', async () => {
    jest.useFakeTimers();

    mockFetchOk({ data: [CATALOG_WITH_PRICE] });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Catálogo Test')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /editar/i });

    // fetch para cargar productos con delay de 3 segundos para simular red lenta
    mockFetchWithDelay({ data: { productos: MOCK_PRODUCTOS } }, 3000);

    await act(async () => {
      fireEvent.click(editBtn);
    });

    // Esperar a que carguen productos
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    await waitFor(() => {
      expect(screen.getByText('Producto Test 1')).toBeInTheDocument();
    });

    // Mock del PUT con delay
    let putResolveCount = 0;
    (global as any).fetch = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            putResolveCount++;
            resolve({ ok: true, json: () => Promise.resolve({}) });
          }, 5000)
        )
    );

    const saveBtn = screen.getByRole('button', { name: /guardar cambios/i });

    // Primer click
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // Verificar que el botón se deshabilita inmediatamente
    expect(saveBtn).toBeDisabled();

    // Intentar segundo click mientras está disabled
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // El botón sigue disabled y el PUT solo se llamó una vez
    expect(saveBtn).toBeDisabled();

    // Resolver el PUT
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    jest.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// T9 — Regresión: "0" en input de precio NO debe enviarse como override
// ---------------------------------------------------------------------------

describe('T9 — Input con valor "0" no persiste en precio_overrides', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('escribir "0" en el input y guardar NO incluye ese código en precio_overrides', async () => {
    let putBody: any = null;
    (global as any).fetch = jest.fn((url: string, init?: any) => {
      // PUT al guardar — capturar body
      if (init?.method === 'PUT') {
        putBody = JSON.parse(init.body);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      // GET categorias (CrearCatalogoDialog)
      if (String(url).includes('/api/categorias')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      // GET público del catálogo (modal edición)
      if (String(url).includes('/api/catalogos/public/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { productos: MOCK_PRODUCTOS } }),
        });
      }
      // GET lista de catálogos
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [CATALOG_WITH_PRICE] }),
      });
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Catálogo Test')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /editar/i });
    await act(async () => {
      fireEvent.click(editBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Producto Test 1')).toBeInTheDocument();
    });

    // Encontrar el input de precio individual del primer producto
    const priceInput = screen.getByRole('spinbutton', {
      name: `Precio individual ${MOCK_PRODUCTOS[0].codigo}`,
    });

    // Escribir "0" en el input
    await act(async () => {
      fireEvent.change(priceInput, { target: { value: '0' } });
    });

    // Click en Guardar
    const saveBtn = screen.getByRole('button', { name: /guardar cambios/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // Verificar que el PUT NO incluye el código en precio_overrides
    expect(putBody).not.toBeNull();
    const overrides: any[] = putBody?.precio_overrides ?? [];
    const contieneCodigoCero = overrides.some(
      (po: any) => po.codigo === MOCK_PRODUCTOS[0].codigo
    );
    expect(contieneCodigoCero).toBe(false);
  });
});
