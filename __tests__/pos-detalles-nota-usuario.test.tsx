/**
 * @jest-environment jsdom
 *
 * Fase B — pos-detalles: la venta en curso se guarda por usuario.
 * Ningún usuario puede adoptar la nota de otro en el mismo navegador.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PosPage } from '@/app/(app)/pos/client_page';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/components/ImageWithFallback', () => ({ ImageWithFallback: () => null }));

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

const GL1 = {
  codigo: 'GL1', detalle: 'Producto A', imagen_url: null, empresa_id: 1,
  prcventa: 1000, precio_mayor: null, saldo: 10, categoria: null,
};
type Linea = { id: string; codigo: string; descripcion: string; modalidad: string; unidades: number; precio: number; subtotal: number };
const linea: Linea = { id: 'it-1', codigo: 'GL1', descripcion: 'Producto A', modalidad: 'detalle', unidades: 1, precio: 1000, subtotal: 1000 };

/** Fake server con una nota persistida (opcional) y creación en memoria. */
function servidor(notaInicial?: { id: number; usuario_id?: number; items: Linea[] }) {
  const state = {
    notaId: notaInicial?.id ?? null,
    usuarioId: notaInicial?.usuario_id as number | undefined,
    items: notaInicial?.items ?? ([] as Linea[]),
    gets: [] as string[],
  };
  global.fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    if (url.startsWith('/api/productos?search=')) return json({ data: [GL1] });
    if (url === '/api/categorias') return json([]);
    if (url === '/api/clientes?rut=66.666.666-6') return json({ data: [] });
    if (url === '/api/notas-venta' && method === 'POST') {
      state.notaId = 55;
      state.usuarioId = undefined;
      return json({ id: 55 });
    }
    const itemsMatch = url.match(/^\/api\/notas-venta\/(\d+)\/items$/);
    if (itemsMatch && method === 'POST') {
      state.items = [linea];
      return json(linea);
    }
    const notaMatch = url.match(/^\/api\/notas-venta\/(\d+)$/);
    if (notaMatch && method === 'GET') {
      state.gets.push(url);
      if (Number(notaMatch[1]) !== state.notaId) return json({ error: 'No encontrada' }, 404);
      return json({ id: state.notaId, usuario_id: state.usuarioId, items: state.items, saldo_pendiente: 1000 });
    }
    return json({ error: 'no mockeado' }, 500);
  }) as any;
  return state;
}

const sesion = (id: string | null) => id ? { user: { id, rol: 'vendedor' } } : null;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  global.confirm = jest.fn(() => true) as any;
});

describe('pos-detalles — venta en curso por usuario', () => {
  test('usuario A guarda la nota bajo su propia clave', async () => {
    servidor();
    render(<PosPage session={sesion('1')} />);
    fireEvent.click(await screen.findByTestId('pos-producto-GL1'));

    await waitFor(() => expect(localStorage.getItem('pos-nota-id:1')).toBe('55'));
    expect(localStorage.getItem('pos-nota-id')).toBeNull();
  });

  test('usuario B no ve la nota guardada por usuario A en el mismo navegador', async () => {
    const state = servidor({ id: 77, usuario_id: 1, items: [linea] });
    localStorage.setItem('pos-nota-id:1', '77');

    render(<PosPage session={sesion('2')} />);
    await screen.findByTestId('pos-producto-GL1');
    await waitFor(() => expect(state.gets).not.toContain('/api/notas-venta/77'));
    expect(screen.queryByTestId('pos-linea-GL1')).toBeNull();
    // La clave ajena no se toca ni se borra.
    expect(localStorage.getItem('pos-nota-id:1')).toBe('77');
  });

  test('clave antigua de OTRO usuario se descarta y se borra', async () => {
    const state = servidor({ id: 77, usuario_id: 1, items: [linea] });
    localStorage.setItem('pos-nota-id', '77');

    render(<PosPage session={sesion('2')} />);
    await waitFor(() => expect(state.gets).toContain('/api/notas-venta/77'));
    await waitFor(() => expect(localStorage.getItem('pos-nota-id')).toBeNull());
    expect(localStorage.getItem('pos-nota-id:2')).toBeNull();
    expect(screen.queryByTestId('pos-linea-GL1')).toBeNull();
  });

  test('API sin usuario_id: NO se adopta y la clave antigua se borra', async () => {
    servidor({ id: 77, items: [linea] });
    localStorage.setItem('pos-nota-id', '77');

    render(<PosPage session={sesion('2')} />);
    await waitFor(() => expect(localStorage.getItem('pos-nota-id')).toBeNull());
    expect(localStorage.getItem('pos-nota-id:2')).toBeNull();
    expect(screen.queryByTestId('pos-linea-GL1')).toBeNull();
  });

  test('clave antigua del MISMO usuario se adopta y se migra a su clave', async () => {
    servidor({ id: 77, usuario_id: 2, items: [linea] });
    localStorage.setItem('pos-nota-id', '77');

    render(<PosPage session={sesion('2')} />);
    await waitFor(() => expect(screen.getByTestId('pos-linea-GL1')).toBeTruthy());
    expect(localStorage.getItem('pos-nota-id')).toBeNull();
    expect(localStorage.getItem('pos-nota-id:2')).toBe('77');
  });

  test('sin sesión no se persiste ninguna venta en curso', async () => {
    servidor();
    render(<PosPage session={null} />);
    fireEvent.click(await screen.findByTestId('pos-producto-GL1'));
    await waitFor(() => expect(screen.getByTestId('pos-linea-GL1')).toBeTruthy());

    expect(localStorage.length).toBe(0);
  });
});
