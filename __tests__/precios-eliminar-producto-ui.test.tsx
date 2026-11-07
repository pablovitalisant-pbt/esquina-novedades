/**
 * @jest-environment jsdom
 *
 * Fase B — fix-ui-eliminar-producto (corrective).
 *
 * Riesgo cubierto: el array `productos` en PreciosContent es estado compartido
 * entre la grilla y el drawer. handleProductUpdate lo reemplazaba con .map(),
 * dejando el producto eliminado (activo=false) visible hasta la proxima busqueda.
 *
 * M05: `precios-paginados` se fija de forma explicita en ON y OFF (BUG-004):
 * ON carga la grilla al abrir; OFF exige 2 caracteres antes de consultar.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PreciosClient } from '@/app/(app)/precios/client_page';
import { Producto } from '@/types';
import flags from '@/config/feature-flags.json';

jest.mock('@/config/feature-flags.json', () => require('@/__tests__/helpers/mockFlags').mockFlags({ 'precios-paginados': false }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/hooks/useShareImage', () => ({ useShareImage: () => ({ shareImage: jest.fn() }) }));

// La card real no aporta nada al flujo: se reemplaza por un boton con testid
// para poder abrir el drawer de un producto puntual.
jest.mock('@/components/ProductCard', () => ({
  ProductCard: ({ producto, onClick }: any) => (
    <button data-testid={`card-${producto.codigo}`} onClick={() => onClick(producto)}>
      {producto.detalle}
    </button>
  ),
}));

const flagsMock = flags as Record<string, boolean>;

const base = {
  empresa_id: 1, umed: 'U', cif: 0, costo: 50, margen_pct: 25, prcminimo: 80,
  cantcaja: 1, pesocaja: 1, cubicaja: 1, nroingreso: null, es_nuevo: false,
  categoria: null, imagen_url: null, fecha_ingreso: new Date(), updated_at: new Date(),
  stock_minimo: 0,
} as unknown as Producto;

const prodA: Producto = { ...base, id: 1, codigo: 'AAA-01', detalle: 'Producto A', saldo: 5, prcventa: 100 };
const prodB: Producto = { ...base, id: 2, codigo: 'BBB-02', detalle: 'Producto B', saldo: 5, prcventa: 200 };

const json = (body: any) => Promise.resolve({ ok: true, status: 200, json: async () => body });

const fetchMock = jest.fn();
global.fetch = fetchMock as any;

const getsProductos = () =>
  fetchMock.mock.calls.map(c => String(c[0])).filter(u => u.startsWith('/api/productos?'));

beforeEach(() => {
  jest.clearAllMocks();
  global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  fetchMock.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes('/eliminar')) {
      return json({ data: { ...prodA, activo: false }, message: 'Producto eliminado' });
    }
    if (u.startsWith('/api/productos?')) return json({ data: [prodA, prodB] });
    if (u.includes('/api/categorias')) return json([]);
    if (u.includes('/api/caja/config')) return json({ data: { valor: '0' } });
    // PUT de edicion: respuesta sin el campo `activo` (payload del endpoint real)
    return json({ data: { ...prodA, prcventa: 999 } });
  });
});

const session = { rol: 'admin', user: { id: '1', rol: 'admin' } } as any;

async function abrirGrilla(paginado: boolean) {
  render(<PreciosClient session={session} />);
  if (paginado) {
    // ON: la primera pagina se carga sola, sin tipear.
    await screen.findByTestId('card-AAA-01', {}, { timeout: 3000 });
  } else {
    // OFF: sin consulta inicial; recien 2 caracteres disparan la busqueda.
    const input = await screen.findByPlaceholderText('Buscar por código o descripción...');
    expect(getsProductos()).toHaveLength(0);
    fireEvent.change(input, { target: { value: 'PR' } });
    await screen.findByTestId('card-AAA-01', {}, { timeout: 3000 });
  }
  const gets = getsProductos();
  expect(gets).toHaveLength(1);
  expect(gets[0].includes('paginado=true')).toBe(paginado);
}

describe.each([true, false])('Precios — eliminar producto (paginado %s)', (paginado) => {
  beforeEach(() => { flagsMock['precios-paginados'] = paginado; });

  test('E2E: buscar → abrir → eliminar → el producto desaparece de la grilla y B queda', async () => {
    await abrirGrilla(paginado);
    expect(screen.getByTestId('card-BBB-02')).toBeInTheDocument();

    // abrir el drawer del producto A
    fireEvent.click(screen.getByTestId('card-AAA-01'));
    fireEvent.click(await screen.findByTestId('eliminar-producto-btn'));
    fireEvent.change(screen.getByTestId('confirmar-eliminar-input'), { target: { value: 'AAA-01' } });
    fireEvent.click(screen.getByTestId('confirmar-eliminar-btn'));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(c => String(c[0]) === '/api/productos/1/eliminar')).toBe(true);
    });

    // el eliminado sale de la lista sin refetch ni nueva busqueda
    await waitFor(() => expect(screen.queryByTestId('card-AAA-01')).toBeNull());
    expect(screen.getByTestId('card-BBB-02')).toBeInTheDocument();
    expect(getsProductos()).toHaveLength(1);
  });

  test('una actualizacion normal (PUT sin `activo`) NO saca el producto de la lista', async () => {
    await abrirGrilla(paginado);
    fireEvent.click(screen.getByTestId('card-AAA-01'));

    fireEvent.click(await screen.findByTitle('Editar producto'));
    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(c => String(c[0]) === '/api/productos/1')).toBe(true);
    });

    expect(screen.getByTestId('card-AAA-01')).toBeInTheDocument();
    expect(screen.getByTestId('card-BBB-02')).toBeInTheDocument();
    expect(getsProductos()).toHaveLength(1);
  });
});
