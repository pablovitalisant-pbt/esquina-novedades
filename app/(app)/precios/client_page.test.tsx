/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PreciosClient } from './client_page';

jest.mock('@/config/feature-flags.json', () => require('@/__tests__/helpers/mockFlags').mockFlags({ 'precios-paginados': true }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/components/ProductCard', () => ({
  ProductCard: ({ producto }: { producto: any }) => <span>{producto.codigo}</span>,
}));
jest.mock('@/components/ProductDrawer', () => ({ ProductDrawer: () => null }));

const fetchMock = jest.fn();
global.fetch = fetchMock as any;

beforeEach(() => {
  jest.clearAllMocks();
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
