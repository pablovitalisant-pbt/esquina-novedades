/**
 * @jest-environment jsdom
 *
 * FASE B — Tests que intentan romper el slice "notas-venta-ux-nomenclatura".
 * Deben fallar en ROJO ahora (la funcionalidad no existe aún).
 */

import React from 'react';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { PrenotaDetallePage } from '@/app/(app)/notas-venta/[id]/client_page';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { rol: 'vendedor' } } }),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: '1' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/notas-venta/1',
}));

/**
 * Helper: crea un mock factory para global.fetch que retorna datos controlados.
 * - GET  /api/notas-venta/1 → prenotaResponse (fetchPrenota)
 * - GET  /api/productos?search=... → searchResults (buscador)
 * - POST /api/notas-venta/1/items → un item recién creado
 */
function crearFetchMock(opts: {
  itemsIniciales?: any[];
  itemsPostAgregar?: any[];
  searchResults?: any[];
  postResponse?: any;
  postDelay?: number;
}) {
  const {
    itemsIniciales = [],
    itemsPostAgregar = [],
    searchResults = [],
    postResponse = { id: 999, codigo: 'NUEVO', descripcion: 'Producto nuevo', cajas: 1, unidades: 1, precio: 10, stock_referencia: 5 },
    postDelay = 0,
  } = opts;

  let fetchPrenotaCallCount = 0;

  return jest.fn().mockImplementation(async (url: string, reqOpts?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : String(url);

    // GET /api/notas-venta/1 — fetchPrenota
    if (urlStr.startsWith('/api/notas-venta/1') && (!reqOpts || reqOpts.method === 'GET' || !reqOpts.method)) {
      fetchPrenotaCallCount++;
      const items = fetchPrenotaCallCount === 1 ? itemsIniciales : itemsPostAgregar;
      return {
        ok: true,
        json: async () => ({
          id: 1,
          titulo: 'Nota de Venta #1',
          nombre_cliente: null,
          items,
        }),
      };
    }

    // GET /api/productos?search= — buscador
    if (urlStr.startsWith('/api/productos?search=')) {
      return {
        ok: true,
        json: async () => ({ data: searchResults }),
      };
    }

    // POST /api/notas-venta/1/items
    if (urlStr.includes('/items') && reqOpts?.method === 'POST') {
      if (postDelay > 0) {
        await new Promise(r => setTimeout(r, postDelay));
      }
      return {
        ok: true,
        json: async () => postResponse,
      };
    }

    // Default
    return {
      ok: true,
      json: async () => ({}),
    };
  });
}

describe('Notas de Venta — auto-focus (Punto 2 del contrato)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Test 1: Race condition ─────────────────────────────────────────
  // Simula dos agregarProducto() en paralelo: POST A es lento, POST B es rápido.
  // Ambos se gatillan desde búsquedas independientes (porque agregarProducto limpia
  // los resultados de búsqueda después de cada click).
  test('[RACE CONDITION] agregar dos productos rápido — el último producto agregado es el que abre en modo edición', async () => {
    const productoA = { codigo: 'A-001', detalle: 'Producto A', prcventa: 10, cantcaja: 1, saldo: 5, empresa_id: 2 };
    const productoB = { codigo: 'B-001', detalle: 'Producto B', prcventa: 20, cantcaja: 2, saldo: 10, empresa_id: 2 };

    let postCount = 0;
    let itemsEnDB: any[] = [];

    global.fetch = jest.fn().mockImplementation(async (url: string, reqOpts?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : String(url);

      // GET /api/notas-venta/1 — fetchPrenota
      if (urlStr.startsWith('/api/notas-venta/1') && (!reqOpts || reqOpts.method === 'GET' || !reqOpts.method)) {
        return {
          ok: true,
          json: async () => ({
            id: 1,
            titulo: 'Nota de Venta #1',
            nombre_cliente: null,
            items: itemsEnDB,
          }),
        };
      }

      // GET /api/productos?search=
      if (urlStr.startsWith('/api/productos?search=')) {
        return {
          ok: true,
          json: async () => ({ data: [productoA, productoB] }),
        };
      }

      // POST items — first is slow (200ms), second is fast (0ms)
      if (urlStr.includes('/items') && reqOpts?.method === 'POST') {
        postCount++;
        const isFirst = postCount === 1;
        const delay = isFirst ? 200 : 0;
        const itemData = {
          id: isFirst ? 10 : 20,
          codigo: isFirst ? 'A-001' : 'B-001',
          descripcion: isFirst ? 'Producto A' : 'Producto B',
          cajas: 1,
          unidades: isFirst ? 1 : 2,
          precio: isFirst ? 10 : 20,
          stock_referencia: 5,
        };
        await new Promise(r => setTimeout(r, delay));
        itemsEnDB = [...itemsEnDB, itemData];
        return { ok: true, json: async () => itemData };
      }

      return { ok: true, json: async () => ({}) };
    });

    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);

    // Esperar carga inicial
    await waitFor(() => expect(screen.queryByText(/cargando/i)).not.toBeInTheDocument());

    // ── Paso 1: buscar y clickear A (POST lento 200ms) ──
    const searchInput = screen.getByPlaceholderText(/buscar por código/i);
    fireChangeAndDebounce(searchInput, 'AA');
    await waitFor(() => expect(screen.getByText('Producto A')).toBeInTheDocument(), { timeout: 1000 });
    fireEvent.click(screen.getByText('Producto A'));

    // Click A limpió la búsqueda. Re-escribir para encontrar B.
    fireChangeAndDebounce(searchInput, 'BB');

    // ── Paso 2: clickear B antes de que POST A resuelva (200ms) ──
    await waitFor(() => expect(screen.getByText('Producto B')).toBeInTheDocument(), { timeout: 1000 });
    fireEvent.click(screen.getByText('Producto B'));

    // ── Paso 3: verificar que B (último click) está en modo edición ──
    await waitFor(() => {
      const inputs = screen.getAllByRole('spinbutton');
      expect(inputs.length).toBeGreaterThan(0);
      const precioInput = Array.from(inputs).find(inp => (inp as HTMLInputElement).value === '20');
      expect(precioInput).toBeTruthy();
    }, { timeout: 5000 });
  });

  // ─── Test 2: Estado compartido ──────────────────────────────────────
  test('[ESTADO COMPARTIDO] autoFocusItemId no interfiere con click manual en Editar de otra fila', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string, reqOpts?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : String(url);

      if (urlStr.startsWith('/api/notas-venta/1') && (!reqOpts || reqOpts.method === 'GET' || !reqOpts.method)) {
        return {
          ok: true,
          json: async () => ({
            id: 1,
            titulo: 'Nota de Venta #1',
            nombre_cliente: null,
            items: [
              { id: 10, codigo: 'X-001', descripcion: 'Item X', cajas: 2, unidades: 4, precio: 15, stock_referencia: 10 },
              { id: 20, codigo: 'Y-002', descripcion: 'Item Y', cajas: 3, unidades: 6, precio: 25, stock_referencia: 8 },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);

    // Esperar que se rendericen los items
    await waitFor(() => expect(screen.getAllByText('X-001').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Y-002').length).toBeGreaterThan(0);

    // Click manual en botón "Editar" del item Y (id=20)
    const editButtons = screen.getAllByRole('button', { name: /editar/i });
    const editButtonY = editButtons[1]; // segundo item
    fireEvent.click(editButtonY);

    // Verificar que Y está en modo edición: debe mostrar input de precio con valor 25
    await waitFor(() => {
      const inputs = screen.getAllByRole('spinbutton');
      const precioInput = inputs.find(inp => (inp as HTMLInputElement).value === '25');
      expect(precioInput).toBeTruthy();
    });

    // Verificar que NO hay input con precio=15 (el de X, que estaría si autoFocusItemId hubiera interferido)
    const inputs = screen.queryAllByRole('spinbutton');
    const precioX = inputs.find(inp => (inp as HTMLInputElement).value === '15');
    expect(precioX).toBeFalsy();
  });
});

describe('Notas de Venta — columna Total (Punto 3 del contrato)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('[TOTAL COLUMN] header usa "Precio" y columna Total muestra el subtotal del item', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        titulo: 'Nota de Venta #1',
        nombre_cliente: null,
        items: [
          { id: 1, codigo: 'TST-01', descripcion: 'Item de prueba', cajas: 1, unidades: 3, precio: 2500, subtotal: '7500.00', stock_referencia: 10 },
        ],
      }),
    });

    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);

    // Header "Precio" (5c: se quitó el sufijo "unitario")
    await waitFor(() => {
      expect(screen.getByText(/^precio$/i)).toBeInTheDocument();
    });

    // Verificar header "Total" presente
    expect(screen.getByText(/^total$/i)).toBeInTheDocument();

    // 5c/5d: la columna Total usa subtotal (3 unidades × $2.500)
    const totalMatches = screen.getAllByText('$7.500');
    expect(totalMatches.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Notas de Venta — smoke E2E auto-foco (Punto 2 del contrato)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('[SMOKE E2E] buscar producto → click → POST con cajas:1 → fila abre en edición con input Cajas enfocado', async () => {
    const productoBuscado = {
      codigo: 'GL81381-1',
      detalle: 'Producto search test',
      prcventa: 7.15,
      cantcaja: 1,
      saldo: 20,
      empresa_id: 2,
    };

    let paso = 0;

    global.fetch = jest.fn().mockImplementation(async (url: string, reqOpts?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : String(url);
      paso++;

      // Primer GET (carga inicial) — sin items
      if (urlStr.startsWith('/api/notas-venta/1') && paso <= 2) {
        return {
          ok: true,
          json: async () => ({
            id: 1,
            titulo: 'Nota de Venta #1',
            nombre_cliente: null,
            items: [],
          }),
        };
      }

      // GET /api/productos?search=GL81381-1
      if (urlStr.startsWith('/api/productos?search=')) {
        return {
          ok: true,
          json: async () => ({ data: [productoBuscado] }),
        };
      }

      // POST items → retorna item creado con id
      if (urlStr.includes('/items') && reqOpts?.method === 'POST') {
        const body = JSON.parse(reqOpts.body as string);
        return {
          ok: true,
          json: async () => ({
            id: 42,
            codigo: body.codigo,
            descripcion: body.descripcion,
            cajas: body.cajas,
            unidades: body.unidades,
            precio: body.precio,
            stock_referencia: body.stock_referencia,
          }),
        };
      }

      // GET fetchPrenota post-agregar — ahora con el item
      return {
        ok: true,
        json: async () => ({
          id: 1,
          titulo: 'Nota de Venta #1',
          nombre_cliente: null,
          items: [
            { id: 42, codigo: 'GL81381-1', descripcion: 'Producto search test', cajas: 1, unidades: 1, precio: 7.15, stock_referencia: 20 },
          ],
        }),
      };
    });

    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);

    // Esperar carga inicial
    await waitFor(() => expect(screen.queryByText(/cargando/i)).not.toBeInTheDocument());

    // Escribir búsqueda
    const searchInput = screen.getByPlaceholderText(/buscar por código/i);
    fireChangeAndDebounce(searchInput, 'GL81381-1');

    // Esperar resultados
    await waitFor(() => expect(screen.getByText('Producto search test')).toBeInTheDocument(), { timeout: 1000 });

    // Click en el resultado
    fireEvent.click(screen.getByText('Producto search test'));

    // Verificar que el item se agregó y la fila abrió en modo edición
    await waitFor(() => {
      // En modo edición, existe un input numérico con el valor de cajas (1)
      const inputs = screen.getAllByRole('spinbutton');
      const cajasInput = inputs.find(inp => (inp as HTMLInputElement).value === '1');
      expect(cajasInput).toBeTruthy();
    });

    // Verificar que el input de cajas tiene foco (el input con valor 1 debe ser document.activeElement)
    const inputs = screen.getAllByRole('spinbutton');
    const cajasInput = inputs.find(inp => (inp as HTMLInputElement).value === '1');
    expect(cajasInput).toBe(document.activeElement);
  });
});

/**
 * Helper: fireChange + esperar debounce de 200ms del componente.
 */
async function fireChangeAndDebounce(el: HTMLElement, value: string) {
  fireEvent.change(el, { target: { value } });
  await act(async () => {
    await new Promise(r => setTimeout(r, 300));
  });
}
