import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { PrenotaDetallePage } from './client_page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({ id: '1' }),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/components/PagarNotaDialog', () => ({
  PagarNotaDialog: () => null,
}));

const mockPrenota = {
  id: '1',
  titulo: 'Nota Test',
  items: [],
  saldo_pendiente: 0,
  total_pagado: 0,
};

const productoA = {
  codigo: 'A-001',
  detalle: 'Producto Alfa',
  imagen_url: null,
  empresa_id: 1,
  prcventa: 10,
  cantcaja: 1,
  saldo: 5,
};

const productoB = {
  codigo: 'B-002',
  detalle: 'Producto Beta',
  imagen_url: null,
  empresa_id: 1,
  prcventa: 20,
  cantcaja: 1,
  saldo: 3,
};

const productoC = {
  codigo: 'C-003',
  detalle: 'Producto Gamma',
  imagen_url: null,
  empresa_id: 1,
  prcventa: 30,
  cantcaja: 1,
  saldo: 8,
};

function mockFetchDefault() {
  return jest.fn((url: string, opts?: any) => {
    if (url === '/api/notas-venta/1' && (!opts || opts.method === undefined)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrenota) });
    }
    if (typeof url === 'string' && url.startsWith('/api/productos?search=')) {
      const q = decodeURIComponent(url.split('=')[1] || '');
      let data: any[] = [];
      if (q === 'ab') data = [productoA, productoB, productoC];
      if (q === 'xyz') data = [productoA];
      if (q === 'alfa') data = [productoA];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data }) });
    }
    if (typeof url === 'string' && url === '/api/notas-venta/1/items' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 999 }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as any;
}

async function renderYBuscar(query: string) {
  jest.useFakeTimers({ legacyFakeTimers: false });
  render(<PrenotaDetallePage session={{}} params={{ id: '1' }} />);

  // resolver el fetch inicial de la prenota
  await act(async () => {
    await Promise.resolve();
  });

  const input = screen.getByPlaceholderText('Buscar por código o descripción...');
  fireEvent.change(input, { target: { value: query } });

  await act(async () => {
    jest.advanceTimersByTime(250);
    await Promise.resolve();
    await Promise.resolve();
  });

  return input;
}

describe('PrenotaDetallePage — buscador de productos (teclado)', () => {
  beforeEach(() => {
    global.fetch = mockFetchDefault();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('SMOKE E2E: permite agregar un producto usando solo teclado (buscar + Enter), sin click', async () => {
    const input = await renderYBuscar('alfa');

    await screen.findByText('Producto Alfa');

    fireEvent.keyDown(input, { key: 'Enter' });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const postCalls = (global.fetch as jest.Mock).mock.calls.filter(
      (c: any[]) => c[0] === '/api/notas-venta/1/items' && c[1]?.method === 'POST'
    );
    expect(postCalls.length).toBe(1);
    expect(JSON.parse(postCalls[0][1].body).codigo).toBe('A-001');
  });

  it('RIESGO — evento asíncrono doble: Enter repetido rápidamente no agrega el producto dos veces', async () => {
    const input = await renderYBuscar('alfa');
    await screen.findByText('Producto Alfa');

    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const postCalls = (global.fetch as jest.Mock).mock.calls.filter(
      (c: any[]) => c[0] === '/api/notas-venta/1/items' && c[1]?.method === 'POST'
    );
    expect(postCalls.length).toBe(1);
  });

  it('RIESGO — índice fuera de rango: resaltar el 3er resultado y luego recibir solo 1 resultado no crashea y usa el índice clampeado', async () => {
    const input = await renderYBuscar('ab');
    await screen.findByText('Producto Gamma');

    // bajar el resaltado hasta el 3er item (Alfa=0, Beta=1, Gamma=2)
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    // nueva búsqueda que reduce resultados a 1 solo item
    fireEvent.change(input, { target: { value: 'xyz' } });
    await act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();
    });
    await screen.findByText('Producto Alfa');

    expect(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
    }).not.toThrow();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const postCalls = (global.fetch as jest.Mock).mock.calls.filter(
      (c: any[]) => c[0] === '/api/notas-venta/1/items' && c[1]?.method === 'POST'
    );
    expect(postCalls.length).toBe(1);
    expect(JSON.parse(postCalls[0][1].body).codigo).toBe('A-001');
  });

  it('CAUSA RAÍZ — mousedown sobre el contenedor de resultados no mueve el foco fuera del input (por eso el blur nunca llega a dispararse)', async () => {
    await renderYBuscar('alfa');
    const resultado = await screen.findByText('Producto Alfa');

    const contenedor = resultado.closest('button')!.parentElement!;

    // el navegador mueve el foco (y dispara blur en el input) como acción
    // por defecto del mousedown, salvo que el handler llame preventDefault().
    // Verificamos directamente que el evento queda marcado como prevented,
    // sin depender de que jsdom simule el cambio de foco real.
    const evento = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    contenedor.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(screen.queryByText('Producto Alfa')).toBeInTheDocument();
  });
});

describe('PrenotaDetallePage — carga por fetch', () => {
  it('carga la nota con fetch a /api/notas-venta/[id]', async () => {
    global.fetch = mockFetchDefault();
    render(<PrenotaDetallePage session={{ user: { id: '7', rol: 'vendedor' } }} params={{ id: '1' }} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/api/notas-venta/');
  });
});

describe('PrenotaDetallePage — cifras ARS equivalentes (slice)', () => {
  // prenota con items para que se renderice el "Total nota de venta"
  const prenotaConItems = {
    id: '1',
    titulo: 'Nota ARS',
    estado: 'activa',
    saldo_pendiente: 25,
    total_pagado: 0,
    items: [{ id: 1, unidades: 2, precio: 10, subtotal: '20.00', codigo: 'A' }],
  };

  function mockFetchConDolar(dolarValor: string | null, configFalla?: boolean) {
    return jest.fn((url: string, opts?: any) => {
      if (url === '/api/notas-venta/1' && (!opts || opts.method === undefined)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(prenotaConItems) });
      }
      if (url === '/api/caja/config') {
        if (configFalla) return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { clave: 'dolar_dia', valor: dolarValor } }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;
  }

  // El smoke viejo esperaba línea ARS (eliminada en slice 2: CLP única moneda).
  // Los dos tests siguientes cubren el comportamiento actual: sin línea ARS.

  it('RIESGO 3: fetch de config falla → no rompe y NO muestra línea ARS', async () => {
    global.fetch = mockFetchConDolar(null, true);
    render(<PrenotaDetallePage session={{}} params={{ id: '1' }} />);

    await waitFor(() => expect(screen.getByText('Total nota de venta:')).toBeInTheDocument());
    expect(screen.queryByText(/AR\$/)).toBeNull();
  });

  it('RIESGO 1: dolar_dia = 0 → no muestra "≈ AR$ 0" ni línea ARS', async () => {
    global.fetch = mockFetchConDolar('0');
    render(<PrenotaDetallePage session={{}} params={{ id: '1' }} />);

    await waitFor(() => expect(screen.getByText('Total nota de venta:')).toBeInTheDocument());
    expect(screen.queryByText(/≈ AR\$ 0/)).toBeNull();
    expect(screen.queryByText(/AR\$/)).toBeNull();
  });
});
