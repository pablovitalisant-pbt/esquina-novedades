/**
 * Fase B — Slice 4c: página pública del pedido muestra el precio de lista
 * tachado, la etiqueta de descuento especial por línea y el ahorro total.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { formatCLP } from '@/lib/utils';

const mockNotFound = jest.fn(() => { throw new Error('NEXT_NOT_FOUND'); });
const mockSql = jest.fn();

jest.mock('next/navigation', () => ({ notFound: () => mockNotFound() }));
jest.mock('@/lib/db', () => ({ sql: (...args: any[]) => mockSql(...args) }));
jest.mock('@/lib/pedidos/liberar-reservas', () => ({
  liberarReservasVencidas: jest.fn().mockResolvedValue({ liberados: 0, unidades: 0 }),
}));
jest.mock('@/config/feature-flags.json', () => ({ 'pedido-confetti': false }));

import PedidoPage from '@/app/pedido/[id]/page';

const UUID = '6c1f0a2e-8b3d-4a5f-9c7e-1d2b3a4c5d6e';

const PEDIDO = {
  id: UUID,
  nombre_contacto: 'Juana Pérez',
  estado: 'convertido',
  created_at: '2026-10-29T12:00:00Z',
  total: 9600,
  entrega_codigo: 'retiro',
  entrega_costo: 0,
  entrega_nombre: 'Retiro en tienda',
  mp_init_point: null,
  expira_en: null,
};

async function html(items: any[]) {
  mockSql.mockImplementation((strings: any) => {
    const q = strings.join('');
    if (q.includes('FROM public.pedidos')) return [PEDIDO];
    if (q.includes('FROM public.pedido_items')) return items;
    return [];
  });
  return renderToStaticMarkup(await PedidoPage({ params: Promise.resolve({ id: UUID }) }));
}

describe('pedido con descuento especial', () => {
  test('línea mayor: precio de lista tachado, etiqueta y ahorro total', async () => {
    const out = await html([
      { codigo: '1055', detalle: 'Gallinita', cantidad: 6, modalidad: 'mayor', precio: 800, precio_lista: 1000, subtotal: 4800 },
    ]);
    expect(out).toContain('Descuento especial');
    expect(out).toContain(formatCLP(1000));
    expect(out).toContain(`Ahorraste ${formatCLP(1200)}`);
  });

  test('sin descuento → nunca aparece el ahorro', async () => {
    const out = await html([
      { codigo: 'A', detalle: 'Uno', cantidad: 2, modalidad: 'detalle', precio: 1000, precio_lista: 1000, subtotal: 2000 },
    ]);
    expect(out).not.toContain('Descuento especial');
    expect(out).not.toContain('Ahorraste');
  });

  test('precio_lista null (pedido viejo) → sin descuento', async () => {
    const out = await html([
      { codigo: 'A', detalle: 'Uno', cantidad: 2, modalidad: 'detalle', precio: 1000, precio_lista: null, subtotal: 2000 },
    ]);
    expect(out).not.toContain('Ahorraste');
  });
});
