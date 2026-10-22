/**
 * @jest-environment jsdom
 *
 * Fase B — fix-ui-eliminar-producto (corrective).
 *
 * Riesgo cubierto: el array `productos` en PreciosContent es estado compartido
 * entre la grilla y el drawer. handleProductUpdate lo reemplazaba con .map(),
 * dejando el producto eliminado (activo=false) visible hasta la proxima busqueda.
 *
 * Test 1 (E2E): buscar → abrir producto → eliminar → desaparece de la grilla.
 * Test 2 (regresion del branch): una actualizacion normal (PUT sin `activo`)
 * NO debe sacar el producto de la lista.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PreciosClient } from '@/app/(app)/precios/client_page';
import { Producto } from '@/types';

jest.mock('@powersync/react', () => ({
  usePowerSync: () => null,
  PowerSyncContext: { Provider: ({ children }: any) => children },
}));
jest.mock('@/lib/powersync/PowerSyncProvider', () => ({
  PowerSyncProvider: ({ children }: any) => children,
}));
jest.mock('@/config/feature-flags.json', () => ({}));
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

async function buscar(term: string) {
  render(<PreciosClient session={session} />);
  const input = await screen.findByPlaceholderText('Buscar por código o descripción...');
  fireEvent.change(input, { target: { value: term } });
  await waitFor(() => expect(screen.getByTestId('card-AAA-01')).toBeInTheDocument(), { timeout: 3000 });
}

describe('Precios — eliminar producto (fix UI)', () => {
  test('E2E: buscar → abrir → eliminar → el producto desaparece de la grilla y B queda', async () => {
    await buscar('PR');
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
    expect(fetchMock.mock.calls.filter(c => String(c[0]).startsWith('/api/productos?'))).toHaveLength(1);
  });

  test('una actualizacion normal (PUT sin `activo`) NO saca el producto de la lista', async () => {
    await buscar('PR');
    fireEvent.click(screen.getByTestId('card-AAA-01'));

    fireEvent.click(await screen.findByTitle('Editar producto'));
    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(c => String(c[0]) === '/api/productos/1')).toBe(true);
    });

    expect(screen.getByTestId('card-AAA-01')).toBeInTheDocument();
    expect(screen.getByTestId('card-BBB-02')).toBeInTheDocument();
  });
});
