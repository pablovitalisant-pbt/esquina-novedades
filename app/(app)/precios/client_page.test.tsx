/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PreciosClient } from './client_page';
import flags from '@/config/feature-flags.json';

jest.mock('@/config/feature-flags.json', () => require('@/__tests__/helpers/mockFlags').mockFlags({ 'precios-paginados': true }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/components/ProductCard', () => ({
  ProductCard: ({ producto }: { producto: any }) => <span>{producto.codigo}</span>,
}));
jest.mock('@/components/ProductDrawer', () => ({ ProductDrawer: () => null }));

const fetchMock = jest.fn();
global.fetch = fetchMock as any;
const flagsMock = flags as Record<string, boolean>;

beforeEach(() => {
  jest.clearAllMocks();
  // M05: cada prueba fija el flag; se restaura ON para aislar del caso OFF.
  flagsMock['precios-paginados'] = true;
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
});

async function typeSearch(term: string) {
  render(<PreciosClient session={{ rol: 'admin', user: { id: '1', rol: 'admin' } } as any} />);
  const input = await screen.findByPlaceholderText('Buscar por código o descripción...');
  fireEvent.change(input, { target: { value: term } });
}

describe('app/(app)/precios — carga por API', () => {
  it('busca en /api/productos y ya no consulta /api/caja/config', async () => {
    await typeSearch('GL8');
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/productos?search=GL8'))).toBe(true);
    }, { timeout: 2000 });
    expect(fetchMock.mock.calls.some(call => call[0] === '/api/caja/config')).toBe(false);
  });
});

const producto = (codigo: string) => ({ id: codigo, codigo, detalle: codigo });
const pagina = (data: any[], siguienteCursor: string | null = null) => ({
  ok: true,
  json: async () => ({ data, siguienteCursor }),
});
const session = { rol: 'admin', user: { id: '1', rol: 'admin' } } as any;

describe('app/(app)/precios — flag inactivo N09b', () => {
  it('no consulta al abrir y busca sin paginado', async () => {
    flagsMock['precios-paginados'] = false;
    render(<PreciosClient session={session} />);
    const input = await screen.findByPlaceholderText('Buscar por código o descripción...');
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'GL8' } });
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/productos?search=GL8'))).toBe(true);
    }, { timeout: 2000 });

    const url = String(fetchMock.mock.calls.find(call => String(call[0]).includes('/api/productos'))?.[0]);
    expect(url).not.toContain('paginado=true');
  });
});

describe('app/(app)/precios — paginado N09b', () => {
  it('con flag activo carga la primera página sin búsqueda', async () => {
    fetchMock.mockResolvedValueOnce(pagina([producto('A1')], 'A1'));
    render(<PreciosClient session={session} />);
    expect(await screen.findByText('A1')).toBeInTheDocument();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('paginado=true');
    expect(url).not.toContain('search=');
  });

  it('Cargar más pide con cursor y anexa resultados', async () => {
    fetchMock
      .mockResolvedValueOnce(pagina([producto('A1')], 'A1'))
      .mockResolvedValueOnce(pagina([producto('B2')]));
    render(<PreciosClient session={session} />);
    expect(await screen.findByText('A1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /cargar más/i }));
    expect(await screen.findByText('B2')).toBeInTheDocument();
    expect(screen.getByText('A1')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[1][0])).toContain('cursor=A1');
  });

  it('cambiar el filtro con Cargar más pendiente reactiva el botón y descarta la respuesta vieja', async () => {
    let resolverViejo!: (v: any) => void;
    fetchMock
      .mockResolvedValueOnce(pagina([producto('A1')], 'A1'))
      .mockImplementationOnce(() => new Promise(res => { resolverViejo = res; }))
      .mockResolvedValueOnce(pagina([producto('NUEVO')], 'N1'));
    render(<PreciosClient session={session} />);
    await screen.findByText('A1');

    fireEvent.click(screen.getByRole('button', { name: /cargar más/i }));
    expect(await screen.findByRole('button', { name: /cargando/i })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Buscar por código o descripción...'), { target: { value: 'AA' } });
    expect(await screen.findByText('NUEVO', {}, { timeout: 2000 })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /cargar más/i })).toBeEnabled();
    await act(async () => { resolverViejo(pagina([producto('VIEJO')], null)); });
    expect(screen.queryByText('VIEJO')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('app/(app)/precios — debounce N13', () => {
  it('tipear COL y luego COLCHON rápido no consulta COL y despacha COLCHON a los 160 ms de la última tecla', async () => {
    jest.useFakeTimers();
    try {
      render(<PreciosClient session={session} />);
      await act(async () => {}); // primera página al montar
      fetchMock.mockClear();

      const input = screen.getByPlaceholderText('Buscar por código o descripción...');
      for (const value of ['C', 'CO', 'COL', 'COLC', 'COLCH', 'COLCHO', 'COLCHON']) {
        fireEvent.change(input, { target: { value } });
      }

      const busquedas = () => fetchMock.mock.calls
        .map((c: any[]) => String(c[0]))
        .filter((u: string) => u.includes('search='));

      await act(async () => { jest.advanceTimersByTime(159); });
      expect(busquedas()).toEqual([]);

      await act(async () => { jest.advanceTimersByTime(1); });
      expect(busquedas()).toEqual(['/api/productos?search=COLCHON&paginado=true']);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('app/(app)/precios — crear con paginado N09c', () => {
  it('crear producto sin búsqueda reconsulta la primera página', async () => {
    fetchMock
      .mockResolvedValueOnce(pagina([producto('A1')]))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { codigo: 'N1' } }) })
      .mockResolvedValueOnce(pagina([producto('N1')]));

    render(<PreciosClient session={session} />);
    expect(await screen.findByText('A1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /agregar producto/i }));
    fireEvent.change(await screen.findByTestId('crear-codigo'), { target: { value: 'N1' } });
    fireEvent.change(screen.getByTestId('crear-detalle'), { target: { value: 'Nuevo' } });
    fireEvent.change(screen.getByTestId('crear-costo'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('crear-prcventa'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: /crear producto/i }));

    expect(await screen.findByText('N1')).toBeInTheDocument();
    const gets = fetchMock.mock.calls
      .filter((c: any[]) => c[1]?.method !== 'POST')
      .map((c: any[]) => String(c[0]));
    expect(gets.at(-1)).toContain('paginado=true');
    expect(gets.at(-1)).not.toContain('cursor=');
    expect(gets.at(-1)).not.toContain('search=');
  });
});
