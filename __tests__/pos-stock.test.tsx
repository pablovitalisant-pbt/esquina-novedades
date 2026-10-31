/**
 * @jest-environment jsdom
 *
 * Fase B — pos-stock con flag ON.
 * Riesgos: grilla/búsqueda piden soloStock, el check lo quita, el lector
 * resuelve el código exacto sin filtro (saldo 0 avisa y no agrega), y una
 * respuesta vieja no pisa la lista nueva al togglear.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { PosPage } from '@/app/(app)/pos/client_page';

jest.mock('@/config/feature-flags.json', () => ({ 'pos-solo-stock': true }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/components/ImageWithFallback', () => ({ ImageWithFallback: () => null }));

const fetchMock = jest.fn();
global.fetch = fetchMock as any;
const session = { user: { id: '1', rol: 'vendedor' } };

type Prod = { codigo: string; detalle: string; imagen_url: null; empresa_id: number; prcventa: number; precio_mayor: number | null; saldo: number; categoria: string | null };
type Linea = { id: string; codigo: string; descripcion: string; modalidad: string; unidades: number; precio: number; subtotal: number };

const CON_STOCK: Prod = { codigo: 'ST1', detalle: 'Con stock', imagen_url: null, empresa_id: 1, prcventa: 1000, precio_mayor: null, saldo: 5, categoria: null };
const SIN_STOCK: Prod = { codigo: 'SS1', detalle: 'Sin stock', imagen_url: null, empresa_id: 1, prcventa: 700, precio_mayor: null, saldo: 0, categoria: null };
const CATALOGO = [CON_STOCK, SIN_STOCK];

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

/** URLs de /api/productos pedidas, en orden. */
function urlsProductos(): string[] {
  return fetchMock.mock.calls.map(c => String(c[0])).filter(u => u.startsWith('/api/productos?'));
}

function productosRespuesta(url: string) {
  const u = new URL(url, 'http://test');
  const q = (u.searchParams.get('search') ?? '').toLowerCase();
  const soloStock = u.searchParams.get('soloStock') === 'true';
  let lista = CATALOGO.filter(p => !q || p.codigo.toLowerCase().includes(q) || p.detalle.toLowerCase().includes(q));
  if (soloStock) lista = lista.filter(p => Number(p.saldo) > 0);
  return json({ data: lista });
}

function servidor() {
  const state = { notaId: null as number | null, items: [] as Linea[], notasCreadas: 0, posts: [] as Record<string, unknown>[] };
  fetchMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) : {};
    if (url.startsWith('/api/productos?')) return productosRespuesta(url);
    if (url === '/api/categorias') return json([]);
    if (url === '/api/clientes?rut=66.666.666-6') return json({ data: [] });
    if (url === '/api/notas-venta' && method === 'POST') {
      state.notasCreadas += 1;
      state.notaId = 55;
      return json({ id: 55 });
    }
    if (/^\/api\/notas-venta\/\d+\/items$/.test(url) && method === 'POST') {
      const prod = CATALOGO.find(p => p.codigo === body.codigo)!;
      state.posts.push(body);
      const linea: Linea = { id: `it-${state.items.length + 1}`, codigo: body.codigo, descripcion: prod.detalle, modalidad: body.modalidad, unidades: body.unidades, precio: prod.prcventa, subtotal: prod.prcventa * body.unidades };
      state.items.push(linea);
      return json(linea);
    }
    const nota = url.match(/^\/api\/notas-venta\/(\d+)$/);
    if (nota && method === 'GET') return json({ items: state.items });
    return json({ error: 'no mockeado' }, 500);
  });
  return state;
}

const buscar = () => screen.getByPlaceholderText('Buscar por código o descripción…');
const check = () => screen.getByRole('checkbox', { name: /ver sin stock/i });

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  global.confirm = jest.fn(() => true) as any;
});

describe('pos-stock — grilla y búsqueda filtradas', () => {
  it('la grilla inicial pide soloStock=true', async () => {
    servidor();
    render(<PosPage session={session} />);

    await waitFor(() => expect(urlsProductos().some(u => u.includes('soloStock=true'))).toBe(true));
    expect(await screen.findByTestId('pos-producto-ST1')).toBeTruthy();
    expect(screen.queryByTestId('pos-producto-SS1')).toBeNull();
  });

  it('la búsqueda por texto pide soloStock=true', async () => {
    servidor();
    render(<PosPage session={session} />);
    await screen.findByTestId('pos-producto-ST1');

    fireEvent.change(buscar(), { target: { value: 'S' } });
    await waitFor(() => expect(urlsProductos().some(u => /search=S(&|$)/.test(u) && u.includes('soloStock=true'))).toBe(true));
    expect(screen.queryByTestId('pos-producto-SS1')).toBeNull();
    expect(screen.getByTestId('pos-producto-ST1')).toBeTruthy();
  });

  it('el check "Ver sin stock" está apagado, es tocable (>=44px) y al encenderse quita el filtro', async () => {
    servidor();
    render(<PosPage session={session} />);
    await screen.findByTestId('pos-producto-ST1');

    const c = check();
    expect(c).not.toBeChecked();
    expect(c.closest('label')!.className).toContain('min-h-11');

    fireEvent.click(c);
    await waitFor(() => expect(
      urlsProductos().some(u => !u.includes('soloStock=true') && u.includes('search='))
    ).toBe(true));
    expect(await screen.findByTestId('pos-producto-SS1')).toBeTruthy();
  });

  it('una respuesta vieja de la búsqueda anterior no pisa la lista nueva al togglear', async () => {
    let resolverVieja: (v: unknown) => void = () => {};
    let llamadas = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (!url.startsWith('/api/productos?')) return json({ data: [] }); // categorías
      llamadas += 1;
      if (llamadas === 1) {
        return new Promise(res => { resolverVieja = res; }); // queda colgada
      }
      return json({ data: CATALOGO }); // sin filtro
    });
    render(<PosPage session={session} />);
    await waitFor(() => expect(llamadas).toBe(1));

    fireEvent.click(check());
    await waitFor(() => expect(llamadas).toBe(2));
    expect(await screen.findByTestId('pos-producto-SS1')).toBeTruthy();

    resolverVieja(json({ data: [CON_STOCK] })); // respuesta tardía de la primera
    await new Promise(r => setTimeout(r, 0));
    expect(screen.getByTestId('pos-producto-SS1')).toBeTruthy();
  });
});

describe('pos-stock — lector / Enter con código exacto', () => {
  it('código exacto sin stock avisa "Sin stock" y no agrega', async () => {
    const state = servidor();
    render(<PosPage session={session} />);
    await screen.findByTestId('pos-producto-ST1');

    fireEvent.change(buscar(), { target: { value: 'SS1' } });
    fireEvent.keyDown(buscar(), { key: 'Enter' });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Sin stock: SS1'));
    expect(state.posts).toHaveLength(0);
    expect(state.notasCreadas).toBe(0);
  });

  it('código exacto sin stock con "Ver sin stock" encendido sí agrega', async () => {
    const state = servidor();
    render(<PosPage session={session} />);
    await screen.findByTestId('pos-producto-ST1');
    fireEvent.click(check());
    await screen.findByTestId('pos-producto-SS1');

    fireEvent.change(buscar(), { target: { value: 'SS1' } });
    fireEvent.keyDown(buscar(), { key: 'Enter' });

    await waitFor(() => expect(state.posts).toHaveLength(1));
    expect(state.posts[0].codigo).toBe('SS1');
  });

  it('código exacto con stock agrega (regresión)', async () => {
    const state = servidor();
    render(<PosPage session={session} />);
    await screen.findByTestId('pos-producto-ST1');

    fireEvent.change(buscar(), { target: { value: 'ST1' } });
    fireEvent.keyDown(buscar(), { key: 'Enter' });

    await waitFor(() => expect(state.posts).toHaveLength(1));
    expect(state.posts[0].codigo).toBe('ST1');
  });
});
