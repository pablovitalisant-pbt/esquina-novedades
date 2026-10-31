/**
 * @jest-environment jsdom
 *
 * Fase B — POS pos2: grilla + nota + atajos.
 * Riesgos: race doble click/Enter, código exacto vs búsqueda parcial, MAYOR sin
 * precio_mayor, atajos disparando con el foco en un input, nota recordada.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { PosPage } from '@/app/(app)/pos/client_page';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/components/ImageWithFallback', () => ({ ImageWithFallback: () => null }));
// Comportamiento previo a pos-stock: estas pruebas fijan el POS tal como era.
jest.mock('@/config/feature-flags.json', () => ({
  'fotos-v1': true,
  'registro_notas_bodega_ui': false,
  'precio-mayorista-ui': true,
  'notas-venta-modalidad': true,
  'clientes-etiqueta': true,
  'tienda-pago-online': true,
  'mp-webhook-ignorar-ipn-legacy': true,
  'pedido-confetti': true,
  'env-validacion-arranque': true,
  'tienda-mayor-online': true,
  'tienda-portada-v2': true,
  'pos-v1': true,
  'tienda-portada-auto': true,
  'pos-solo-stock': false,
}));

const fetchMock = jest.fn();
global.fetch = fetchMock as any;
const session = { user: { id: '1', rol: 'vendedor' } };

type Prod = { codigo: string; detalle: string; imagen_url: null; empresa_id: number; prcventa: number; precio_mayor: number | null; saldo: number; categoria: string | null };
type Linea = { id: string; codigo: string; descripcion: string; modalidad: string; unidades: number; precio: number; subtotal: number };

const GL1: Prod = { codigo: 'GL1', detalle: 'Producto A', imagen_url: null, empresa_id: 1, prcventa: 1000, precio_mayor: 800, saldo: 10, categoria: 'Juguete' };
const GL2: Prod = { codigo: 'GL2', detalle: 'Producto B', imagen_url: null, empresa_id: 1, prcventa: 500, precio_mayor: null, saldo: 5, categoria: 'Juguete' };

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

/** Fake server: /api/productos, /api/categorias, nota + items en memoria. */
function servidor(
  productos: Prod[],
  notaInicial?: { id: number; items: Linea[] },
  filtrar?: (q: string, lista: Prod[]) => Prod[],
  mesonId?: string
) {
  const state = {
    notaId: notaInicial?.id ?? null,
    items: notaInicial?.items ?? ([] as Linea[]),
    notasCreadas: 0,
    posts: [] as Record<string, unknown>[],
    patches: [] as Record<string, unknown>[],
    deletes: 0,
    notaBody: null as Record<string, unknown> | null,
  };
  fetchMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) : {};
    if (url === '/api/clientes?rut=66.666.666-6') {
      return mesonId
        ? json({ data: [{ id: mesonId, nombre: 'Cliente de mesón' }] })
        : json({ data: [] });
    }
    if (url.startsWith('/api/productos?search=')) {
      const q = decodeURIComponent(url.split('search=')[1] ?? '');
      return json({ data: filtrar ? filtrar(q, productos) : productos });
    }
    if (url === '/api/categorias') return json([{ nombre: 'Juguete' }]);
    if (url === '/api/notas-venta' && method === 'POST') {
      state.notasCreadas += 1;
      state.notaBody = body;
      state.notaId = 55;
      return json({ id: 55 });
    }
    const itemsMatch = url.match(/^\/api\/notas-venta\/(\d+)\/items$/);
    if (itemsMatch && method === 'POST') {
      const prod = productos.find(p => p.codigo === body.codigo)!;
      state.posts.push(body);
      const precio = body.modalidad === 'mayor' ? Number(prod.precio_mayor) : Number(prod.prcventa);
      const linea: Linea = {
        id: `it-${state.items.length + 1}`,
        codigo: body.codigo,
        descripcion: prod.detalle,
        modalidad: body.modalidad,
        unidades: body.unidades,
        precio,
        subtotal: precio * body.unidades,
      };
      state.items.push(linea);
      return json(linea);
    }
    const itemMatch = url.match(/^\/api\/notas-venta\/\d+\/items\/(it-\d+)$/);
    if (itemMatch && (method === 'PATCH' || method === 'DELETE')) {
      const linea = state.items.find(i => i.id === itemMatch[1])!;
      if (method === 'DELETE') {
        state.deletes += 1;
        state.items = state.items.filter(i => i.id !== itemMatch[1]);
        return json({ ok: true });
      }
      state.patches.push({ id: itemMatch[1], ...body });
      if (body.unidades !== undefined) linea.unidades = body.unidades;
      if (body.modalidad !== undefined) {
        const prod = productos.find(p => p.codigo === linea.codigo)!;
        linea.modalidad = body.modalidad;
        linea.precio = body.modalidad === 'mayor' ? Number(prod.precio_mayor) : Number(prod.prcventa);
      }
      linea.subtotal = linea.precio * linea.unidades;
      return json(linea);
    }
    const notaMatch = url.match(/^\/api\/notas-venta\/(\d+)$/);
    if (notaMatch && method === 'GET') {
      if (Number(notaMatch[1]) !== state.notaId) return json({ error: 'No encontrada' }, 404);
      return json({ items: state.items });
    }
    return json({ error: 'no mockeado' }, 500);
  });
  return state;
}

const buscar = () => screen.getByPlaceholderText('Buscar por código o descripción…');

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  global.confirm = jest.fn(() => true) as any;
});

describe('POS pos2 — flujo con mouse', () => {
  it('buscar → agregar → +1 → MAYOR → total correcto', async () => {
    const state = servidor([GL1, GL2]);
    render(<PosPage session={session} />);

    fireEvent.click(await screen.findByTestId('pos-producto-GL1'));
    await waitFor(() => expect(screen.getByTestId('pos-cantidad-GL1')).toHaveTextContent('1'));
    expect(state.notasCreadas).toBe(1);
    expect(screen.getByTestId('pos-total')).toHaveTextContent('1.000');

    fireEvent.click(screen.getByLabelText('Agregar una unidad de Producto A'));
    await waitFor(() => expect(screen.getByTestId('pos-cantidad-GL1')).toHaveTextContent('2'));
    expect(screen.getByTestId('pos-total')).toHaveTextContent('2.000');

    const linea = screen.getByTestId('pos-linea-GL1');
    fireEvent.click(within(linea).getByText('POR MENOR'));
    await waitFor(() => expect(within(screen.getByTestId('pos-linea-GL1')).getByText('POR MAYOR')).toBeTruthy());
    expect(screen.getByTestId('pos-total')).toHaveTextContent('1.600');
    expect(localStorage.getItem('pos-nota-id:1')).toBe('55');
  });

  it('MAYOR deshabilitado si el producto no tiene precio_mayor', async () => {
    servidor([GL2]);
    render(<PosPage session={session} />);
    fireEvent.click(await screen.findByTestId('pos-producto-GL2'));
    await waitFor(() => expect(screen.getByTestId('pos-linea-GL2')).toBeTruthy());

    const toggle = within(screen.getByTestId('pos-linea-GL2')).getByText('POR MENOR');
    expect(toggle).toBeDisabled();
  });

  it('"Nueva venta" olvida la nota guardada', async () => {
    servidor([GL1], { id: 77, items: [{ id: 'it-1', codigo: 'GL1', descripcion: 'Producto A', modalidad: 'detalle', unidades: 1, precio: 1000, subtotal: 1000 }] });
    localStorage.setItem('pos-nota-id:1', '77');
    render(<PosPage session={session} />);

    await waitFor(() => expect(screen.getByTestId('pos-linea-GL1')).toBeTruthy());
    fireEvent.click(screen.getByText('Nueva venta'));
    await waitFor(() => expect(localStorage.getItem('pos-nota-id:1')).toBeNull());
  });
});

describe('POS pos2 — race y teclado', () => {
  it('doble click seguido crea una sola nota y un solo ítem', async () => {
    const state = servidor([GL1]);
    render(<PosPage session={session} />);
    const card = await screen.findByTestId('pos-producto-GL1');
    fireEvent.click(card);
    fireEvent.click(card);

    await waitFor(() => expect(state.posts.length).toBe(1));
    expect(state.notasCreadas).toBe(1);
  });

  it('Enter con código exacto agrega el exacto, no el resaltado', async () => {
    // El servidor devuelve GL100 primero (resaltado) y GL10 después (exacto).
    const gl100 = { ...GL1, codigo: 'GL100', detalle: 'Producto 100', prcventa: 200 };
    const gl10 = { ...GL1, codigo: 'GL10', detalle: 'Producto 10', prcventa: 300 };
    const state = servidor([gl100, gl10]);
    render(<PosPage session={session} />);

    fireEvent.change(buscar(), { target: { value: 'GL10' } });
    await waitFor(() => expect(screen.getByTestId('pos-producto-GL100')).toBeTruthy());
    fireEvent.keyDown(buscar(), { key: 'Enter' });

    await waitFor(() => expect(state.posts.length).toBe(1));
    expect(state.posts[0].codigo).toBe('GL10');
  });

  it('atajos no disparan con texto en el buscador; sí con la búsqueda vacía', async () => {
    const state = servidor([GL1]);
    render(<PosPage session={session} />);
    fireEvent.click(await screen.findByTestId('pos-producto-GL1'));
    await waitFor(() => expect(screen.getByTestId('pos-cantidad-GL1')).toHaveTextContent('1'));

    fireEvent.change(buscar(), { target: { value: 'GL' } });
    fireEvent.keyDown(buscar(), { key: '+' });
    expect(state.patches).toHaveLength(0);

    fireEvent.change(buscar(), { target: { value: '' } });
    fireEvent.keyDown(document.body, { key: '+' });
    await waitFor(() => expect(screen.getByTestId('pos-cantidad-GL1')).toHaveTextContent('2'));
  });

  it('F9 abre COBRAR; Supr quita la línea seleccionada', async () => {
    const state = servidor([GL1]);
    render(<PosPage session={session} />);
    fireEvent.click(await screen.findByTestId('pos-producto-GL1'));
    await waitFor(() => expect(screen.getByTestId('pos-linea-GL1')).toBeTruthy());

    fireEvent.keyDown(document.body, { key: 'F9' });
    await waitFor(() => expect(screen.getByTestId('pos-cobrar')).toBeTruthy());

    // Con el diálogo abierto los atajos del POS están bloqueados: se cierra primero.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('pos-cobrar')).toBeNull());

    fireEvent.keyDown(document.body, { key: 'Delete' });
    await waitFor(() => expect(state.deletes).toBe(1));
  });

  it('escribir una letra con foco fuera enfoca el buscador y la escribe', async () => {
    servidor([GL1]);
    render(<PosPage session={session} />);
    await screen.findByTestId('pos-producto-GL1');

    fireEvent.keyDown(document.body, { key: 'G' });
    await waitFor(() => expect(buscar()).toHaveValue('G'));
    expect(document.activeElement).toBe(buscar());
  });

  it('la barra móvil muestra items y total', async () => {
    servidor([GL1]);
    render(<PosPage session={session} />);
    fireEvent.click(await screen.findByTestId('pos-producto-GL1'));
    await waitFor(() =>
      expect(screen.getByTestId('pos-barra-movil')).toHaveTextContent('1 ítem'));
    expect(screen.getByTestId('pos-barra-movil')).toHaveTextContent('1.000');
  });
});

describe('POS pos3 — cliente de la venta', () => {
  it('primer producto sin cliente: la nota se crea con el Cliente de mesón', async () => {
    const state = servidor([GL1], undefined, undefined, 'u-meson');
    render(<PosPage session={session} />);
    fireEvent.click(await screen.findByTestId('pos-producto-GL1'));

    await waitFor(() => expect(state.notasCreadas).toBe(1));
    expect(state.notaBody).toEqual({ cliente_id: 'u-meson' });
    expect(screen.queryByTestId('pos-meson-faltante')).toBeNull();
  });

  it('si no existe el Cliente de mesón, la venta no se bloquea y avisa', async () => {
    const state = servidor([GL1]);
    render(<PosPage session={session} />);
    fireEvent.click(await screen.findByTestId('pos-producto-GL1'));

    await waitFor(() => expect(state.notasCreadas).toBe(1));
    expect(state.notaBody).toEqual({});
    expect(await screen.findByTestId('pos-meson-faltante')).toBeTruthy();
    expect(screen.getByTestId('pos-linea-GL1')).toBeTruthy();
  });

  it('F4 abre el selector y elegir un reciente cambia el cliente mostrado', async () => {
    servidor([GL1]);
    localStorage.setItem('pos-clientes-recientes', JSON.stringify([{ id: 'c-ana', nombre: 'Ana Pérez' }]));
    render(<PosPage session={session} />);
    await screen.findByTestId('pos-producto-GL1');

    fireEvent.keyDown(document.body, { key: 'F4' });
    fireEvent.click(await screen.findByTestId('pos-cliente-opcion-c-ana'));

    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeTruthy());
  });

  it('con nota creada, elegir cliente actualiza por PATCH', async () => {
    const state = servidor([GL1], { id: 77, items: [{ id: 'it-1', codigo: 'GL1', descripcion: 'Producto A', modalidad: 'detalle', unidades: 1, precio: 1000, subtotal: 1000 }] });
    localStorage.setItem('pos-nota-id:1', '77');
    localStorage.setItem('pos-clientes-recientes', JSON.stringify([{ id: 'c-ana', nombre: 'Ana Pérez' }]));
    let patchBody: Record<string, unknown> | null = null;
    fetchMock.mockImplementation(((original) => async (url: string, init?: any) => {
      if (url === '/api/notas-venta/77' && init?.method === 'PATCH') {
        patchBody = JSON.parse(init.body);
        return json({ ok: true });
      }
      return original(url, init);
    })(fetchMock.getMockImplementation()!));

    render(<PosPage session={session} />);
    fireEvent.click(await screen.findByText('Cambiar cliente'));
    fireEvent.click(await screen.findByTestId('pos-cliente-opcion-c-ana'));

    await waitFor(() => expect(patchBody).toEqual({ cliente_id: 'c-ana' }));
  });
});

describe('POS pos2 — bugs de QA visual (teclado real)', () => {
  const QA001: Prod = { codigo: 'QA-001', detalle: 'Cinta', imagen_url: null, empresa_id: 1, prcventa: 100, precio_mayor: null, saldo: 10, categoria: null };
  const QA004: Prod = { codigo: 'QA-004', detalle: 'Goma', imagen_url: null, empresa_id: 1, prcventa: 200, precio_mayor: null, saldo: 10, categoria: null };

  it('barcode: el "-" se escribe en la búsqueda y Enter agrega QA-004, no QA-001', async () => {
    const state = servidor([QA001, QA004]);
    render(<PosPage session={session} />);
    await screen.findByTestId('pos-producto-QA-001');

    // El lector manda la secuencia completa al documento, incluso si el foco
    // cambia a mitad de camino.
    for (const ch of 'QA-004') fireEvent.keyDown(document.body, { key: ch });

    expect(buscar()).toHaveValue('QA-004');
    expect(state.patches).toHaveLength(0);

    fireEvent.keyDown(document.body, { key: 'Enter' });
    await waitFor(() => expect(state.posts).toHaveLength(1));
    expect(state.posts[0].codigo).toBe('QA-004');
  });

  it('Enter sin resultados no agrega nada y avisa "Sin resultados"', async () => {
    const state = servidor([QA001], undefined, (q, lista) =>
      q ? lista.filter(p => p.codigo.toLowerCase().includes(q.toLowerCase())) : lista);
    render(<PosPage session={session} />);
    await screen.findByTestId('pos-producto-QA-001');

    for (const ch of 'XYZ') fireEvent.keyDown(document.body, { key: ch });
    fireEvent.keyDown(document.body, { key: 'Enter' });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Sin resultados para XYZ'));
    expect(state.posts).toHaveLength(0);
    expect(state.notasCreadas).toBe(0);
  });

  it('agregar un producto ya presente con la misma modalidad suma +1 (sin duplicar)', async () => {
    const state = servidor([QA001]);
    render(<PosPage session={session} />);

    fireEvent.click(await screen.findByTestId('pos-producto-QA-001'));
    await waitFor(() => expect(screen.getByTestId('pos-cantidad-QA-001')).toHaveTextContent('1'));
    fireEvent.click(screen.getByTestId('pos-producto-QA-001'));

    await waitFor(() => expect(screen.getByTestId('pos-cantidad-QA-001')).toHaveTextContent('2'));
    expect(state.posts).toHaveLength(1);
    expect(screen.getAllByTestId('pos-linea-QA-001')).toHaveLength(1);
    expect(state.patches[state.patches.length - 1]).toMatchObject({ unidades: 2 });
  });

  it('+ y NumpadAdd/Subtract ajustan la última línea con la búsqueda vacía (también con foco en el buscador)', async () => {
    const state = servidor([QA001, QA004]);
    render(<PosPage session={session} />);

    fireEvent.click(await screen.findByTestId('pos-producto-QA-001'));
    await waitFor(() => expect(screen.getByTestId('pos-cantidad-QA-001')).toHaveTextContent('1'));
    fireEvent.click(screen.getByTestId('pos-producto-QA-004'));
    await waitFor(() => expect(screen.getByTestId('pos-cantidad-QA-004')).toHaveTextContent('1'));
    // El bloqueo anti doble-click se libera al terminar el request.
    const libre = () => waitFor(() =>
      expect(screen.getByLabelText('Agregar una unidad de Goma')).not.toBeDisabled());

    await libre();
    fireEvent.keyDown(buscar(), { key: '+', code: 'Equal' });
    await waitFor(() => expect(state.patches[state.patches.length - 1]).toMatchObject({ id: 'it-2', unidades: 2 }));

    await libre();
    fireEvent.keyDown(document.body, { key: '+', code: 'NumpadAdd' });
    await waitFor(() => expect(state.patches[state.patches.length - 1]).toMatchObject({ id: 'it-2', unidades: 3 }));

    await libre();
    fireEvent.keyDown(document.body, { key: '-', code: 'NumpadSubtract' });
    await waitFor(() => expect(state.patches[state.patches.length - 1]).toMatchObject({ id: 'it-2', unidades: 2 }));
  });

  it('con texto en la búsqueda, "+" se escribe en vez de ajustar cantidad', async () => {
    const state = servidor([QA001, QA004]);
    render(<PosPage session={session} />);
    await screen.findByTestId('pos-producto-QA-001');

    fireEvent.change(buscar(), { target: { value: 'QA' } });
    fireEvent.keyDown(document.body, { key: '+', code: 'Equal' });

    expect(buscar()).toHaveValue('QA+');
    expect(state.patches).toHaveLength(0);
  });
});
