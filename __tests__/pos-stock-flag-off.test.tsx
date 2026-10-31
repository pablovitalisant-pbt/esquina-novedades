/**
 * @jest-environment jsdom
 *
 * Fase B — pos-stock con flag OFF: POS idéntico a hoy, sin soloStock ni check.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PosPage } from '@/app/(app)/pos/client_page';

jest.mock('@/config/feature-flags.json', () => ({ 'pos-solo-stock': false }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/components/ImageWithFallback', () => ({ ImageWithFallback: () => null }));

const fetchMock = jest.fn();
global.fetch = fetchMock as any;
const session = { user: { id: '1', rol: 'vendedor' } };

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const PRODUCTOS = [
  { codigo: 'ST1', detalle: 'Con stock', imagen_url: null, empresa_id: 1, prcventa: 1000, precio_mayor: null, saldo: 5, categoria: null },
  { codigo: 'SS1', detalle: 'Sin stock', imagen_url: null, empresa_id: 1, prcventa: 700, precio_mayor: null, saldo: 0, categoria: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  global.confirm = jest.fn(() => true) as any;
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/productos?')) return json({ data: PRODUCTOS });
    if (url === '/api/categorias') return json([]);
    return json({ error: 'no mockeado' }, 500);
  });
});

it('sin flag no envía soloStock ni muestra el check, y lista todo como hoy', async () => {
  render(<PosPage session={session} />);

  expect(await screen.findByTestId('pos-producto-SS1')).toBeTruthy();
  expect(screen.getByTestId('pos-producto-ST1')).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();

  fireEvent.change(screen.getByPlaceholderText('Buscar por código o descripción…'), { target: { value: 'S' } });
  await waitFor(() => {
    const urls = fetchMock.mock.calls.map(c => String(c[0])).filter(u => u.startsWith('/api/productos?'));
    expect(urls.some(u => /search=S(&|$)/.test(u))).toBe(true);
    expect(urls.some(u => u.includes('soloStock'))).toBe(false);
  });
});
