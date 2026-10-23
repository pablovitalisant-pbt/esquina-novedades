/**
 * Fase B — Slice 9d: página pública /pedido/[id].
 * Intenta romper: PII expuesta, id inexistente/inválido (500 en vez de 404),
 * botón de pago visible fuera de `pendiente_pago` o vencido.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { formatCLP } from '@/lib/utils';

const mockNotFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
const mockSql = jest.fn();
const mockLiberar = jest.fn();

jest.mock('next/navigation', () => ({ notFound: () => mockNotFound() }));
jest.mock('@/lib/db', () => ({ sql: (...args: any[]) => mockSql(...args) }));
jest.mock('@/lib/pedidos/liberar-reservas', () => ({
  liberarReservasVencidas: (...args: any[]) => mockLiberar(...args),
}));

jest.mock('@/config/feature-flags.json', () => ({ 'pedido-confetti': true }));

import PedidoPage from '@/app/pedido/[id]/page';

const UUID = '6c1f0a2e-8b3d-4a5f-9c7e-1d2b3a4c5d6e';

// Incluye PII a propósito: la página no debe seleccionarla ni renderizarla.
const PEDIDO = {
  id: UUID,
  nombre_contacto: 'Juana Pérez',
  estado: 'pendiente_pago',
  created_at: '2026-10-22T12:00:00Z',
  total: 4500,
  entrega_codigo: 'delivery',
  entrega_costo: 3000,
  entrega_nombre: 'Delivery Iquique',
  mp_init_point: 'https://mp.example/checkout',
  expira_en: '2099-01-01T00:00:00Z',
  telefono_contacto: '+56912345678',
  email_contacto: 'juana@example.com',
  direccion_entrega: 'Av. Prat 123',
};
const ITEMS = [
  { codigo: '1055', detalle: 'Gallinita', cantidad: 1, modalidad: 'unidad', precio: 1500, subtotal: 1500 },
];

function setupDb(pedido: any = PEDIDO, items: any[] = ITEMS) {
  mockSql.mockImplementation((strings: any) => {
    const q = strings.join('');
    if (q.includes('FROM public.pedidos')) return pedido ? [pedido] : [];
    if (q.includes('FROM public.pedido_items')) return items;
    return [];
  });
}

async function html(pedido: any = PEDIDO, items: any[] = ITEMS) {
  setupDb(pedido, items);
  return renderToStaticMarkup(await PedidoPage({ params: Promise.resolve({ id: UUID }) }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLiberar.mockResolvedValue({ liberados: 0, unidades: 0 });
});

describe('privacidad y 404', () => {
  test('no expone teléfono, email ni dirección; muestra nombre, ítems y total', async () => {
    const out = await html();
    expect(out).toContain('Juana Pérez');
    expect(out).toContain('Gallinita');
    expect(out).toContain(formatCLP(4500));
    expect(out).not.toContain('+56912345678');
    expect(out).not.toContain('juana@example.com');
    expect(out).not.toContain('Av. Prat 123');
  });

  test('id inexistente → notFound (404), no 500', async () => {
    setupDb(null);
    await expect(PedidoPage({ params: Promise.resolve({ id: UUID }) })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalled();
  });

  test('id no UUID → notFound sin consultar la DB', async () => {
    await expect(PedidoPage({ params: Promise.resolve({ id: '../../etc/passwd' }) })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockSql).not.toHaveBeenCalled();
  });
});

describe('botón de pago y mensajes por estado', () => {
  test('pendiente_pago vigente con init point → enlace "Pagar con Mercado Pago"', async () => {
    const out = await html();
    expect(out).toContain('Pagar con Mercado Pago');
    expect(out).toContain('https://mp.example/checkout');
  });

  test('pendiente_pago vencido → sin enlace de pago', async () => {
    const out = await html({ ...PEDIDO, expira_en: '2020-01-01T00:00:00Z' });
    expect(out).not.toContain('Pagar con Mercado Pago');
    expect(out).not.toContain('https://mp.example/checkout');
  });

  test('revision → "Pago en revisión" sin enlace', async () => {
    const out = await html({ ...PEDIDO, estado: 'revision' });
    expect(out).toContain('Pago en revisión');
    expect(out).not.toContain('Pagar con Mercado Pago');
  });

  test.each(['rechazado', 'expirado'])('%s → sin enlace de pago', async (estado) => {
    const out = await html({ ...PEDIDO, estado });
    expect(out).not.toContain('Pagar con Mercado Pago');
  });
});

// ─── Ciclo pedido festivo: diseño por estado + confetti ───
const flagsMock = jest.requireMock('@/config/feature-flags.json') as Record<string, boolean>;

describe('diseño festivo por estado', () => {
  afterEach(() => { flagsMock['pedido-confetti'] = true; });

  test.each(['convertido', 'pagado'])('%s → agradecimiento, confetti y "Seguir comprando"', async (estado) => {
    const out = await html({ ...PEDIDO, estado });
    expect(out).toContain('¡Gracias por tu compra');
    expect(out).toContain('data-confetti');
    expect(out).toContain('Seguir comprando');
    expect(out).not.toContain('Pagar con Mercado Pago');
  });

  test.each(['pendiente_pago', 'rechazado', 'expirado', 'revision', 'pagado_tardio', 'descartado'])(
    '%s → nunca confetti', async (estado) => {
      const out = await html({ ...PEDIDO, estado });
      expect(out).not.toContain('data-confetti');
    },
  );

  test('pendiente_pago → "Tu pedido está reservado" y número corto del pedido', async () => {
    const out = await html();
    expect(out).toContain('Tu pedido está reservado');
    expect(out).toContain('#6C1F0A2E');
  });

  test('revision → "Estamos revisando tu pago"', async () => {
    expect(await html({ ...PEDIDO, estado: 'revision' })).toContain('Estamos revisando tu pago');
  });

  test('rechazado → "El pago fue rechazado"', async () => {
    expect(await html({ ...PEDIDO, estado: 'rechazado' })).toContain('El pago fue rechazado');
  });

  test('flag pedido-confetti OFF → convertido sin confetti, con agradecimiento', async () => {
    flagsMock['pedido-confetti'] = false;
    const out = await html({ ...PEDIDO, estado: 'convertido' });
    expect(out).not.toContain('data-confetti');
    expect(out).toContain('¡Gracias por tu compra');
  });
});