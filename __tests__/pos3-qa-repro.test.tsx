/**
 * QA pos3 — reproducción del escenario real:
 * grilla con search vacío + nota restaurada con items + /api/clientes?rut=.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { PosPage } from '@/app/(app)/pos/client_page';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
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

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const seis = Array.from({ length: 6 }, (_, i) => ({
  codigo: `P${i + 1}`,
  detalle: `Producto ${i + 1}`,
  imagen_url: null,
  empresa_id: 1,
  prcventa: 1000,
  precio_mayor: null,
  saldo: 10,
  categoria: 'Juguete',
}));
const cuatro = Array.from({ length: 4 }, (_, i) => ({
  id: `it-${i + 1}`,
  codigo: `P${i + 1}`,
  descripcion: `Producto ${i + 1}`,
  modalidad: 'detalle',
  unidades: 1,
  precio: 1000,
  subtotal: 1000,
}));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  global.fetch = jest.fn(async (url: string) => {
    if (url === '/api/productos?search=') return json({ data: seis });
    if (url === '/api/categorias') return json([{ nombre: 'Juguete' }]);
    if (url === '/api/notas-venta/283') {
      return json({ id: 283, estado: 'activa', items: cuatro, saldo_pendiente: 4000 });
    }
    if (url === '/api/clientes?rut=66.666.666-6') {
      return json({ data: [{ id: 'meson-uuid', nombre: 'Cliente de mesón' }] });
    }
    return json({ error: 'no mockeado' }, 500);
  }) as any;
});

it('QA: con productos y nota restaurada, la grilla y la nota se pintan', async () => {
  localStorage.setItem('pos-nota-id:7', '283');
  render(<PosPage session={{ user: { id: '7', rol: 'vendedor' } }} />);

  await waitFor(() => expect(screen.getByTestId('pos-producto-P1')).toBeTruthy());
  expect(screen.getAllByTestId(/^pos-producto-/)).toHaveLength(6);
  await waitFor(() => expect(screen.getByTestId('pos-linea-P1')).toBeTruthy());
  expect(screen.getAllByTestId(/^pos-linea-/)).toHaveLength(4);
});
