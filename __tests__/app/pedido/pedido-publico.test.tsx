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

jest.mock('@/config/feature-flags.json', () => require('@/__tests__/helpers/mockFlags').mockFlags({ 'pedido-confetti': true, 'pedido-pago-opcional': false }));

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

describe('cantidades en unidades', () => {
  test('mayor → "(por mayor)"; detalle → unidades; nunca "cajas"', async () => {
    const out = await html(PEDIDO, [
      { codigo: 'A', detalle: 'Uno', cantidad: 2, modalidad: 'mayor', precio: 900, subtotal: 1800 },
      { codigo: 'B', detalle: 'Dos', cantidad: 1, modalidad: 'detalle', precio: 1500, subtotal: 1500 },
    ]);
    expect(out).toContain('2 unidades (por mayor)');
    expect(out).toContain('1 unidad');
    expect(out).not.toContain('cajas');
  });
});

describe('botón de pago y mensajes por estado', () => {
  test('pendiente_pago vigente con init point → enlace "Pagar con Mercado Pago"', async () => {
    const out = await html();
    expect(out).toContain('Pagar con Mercado Pago');
    expect(out).toContain('https://mp.example/checkout');
  });

  test('flag pedido-pago-opcional ON, stock reservado y sin init point → botón de pago', async () => {
    flagsMock['pedido-pago-opcional'] = true;
    try {
      const out = await html({ ...PEDIDO, stock_reservado: true, mp_init_point: null });
      expect(out).toContain('Pagar con Mercado Pago');
    } finally {
      flagsMock['pedido-pago-opcional'] = false;
    }
  });

  test.each([
    ['stock false', { stock_reservado: false }],
    ['expira inválida', { stock_reservado: true, expira_en: 'x' }],
    ['convertido', { stock_reservado: true, estado: 'convertido' }],
  ])('flag ON + init point + %s → sin Pagar', async (_c, extra) => {
    flagsMock['pedido-pago-opcional'] = true;
    const out = await html({ ...PEDIDO, mp_init_point: 'https://mp.example/x', ...extra });
    flagsMock['pedido-pago-opcional'] = false;
    expect(out).not.toContain('Pagar con Mercado Pago');
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

// ─── N03c2: medios alternativos integrados a la página ───
describe('medios de pago alternativos', () => {
  const DATOS = { banco: 'Banco Fake', titular: 'Ana Pérez', rut: '11.111.111-1', tipo_cuenta: 'Cuenta Vista', numero_cuenta: '0001234' };
  const ENV = ['TRANSFERENCIA_BANCO', 'TRANSFERENCIA_TITULAR', 'TRANSFERENCIA_RUT', 'TRANSFERENCIA_TIPO_CUENTA', 'TRANSFERENCIA_NUMERO_CUENTA'];
  const envPrevio: Record<string, string | undefined> = {};
  // Casos alternativos: sin preferencia MP histórica (la elección MP es exclusiva).
  const base = { ...PEDIDO, stock_reservado: true, mp_init_point: null };
  const local = (activa: boolean) => ({ ...base, entrega_codigo: 'delivery_iquique', activa, entrega_activa: activa });

  beforeAll(() => {
    ENV.forEach((clave) => { envPrevio[clave] = process.env[clave]; });
    Object.assign(process.env, { TRANSFERENCIA_BANCO: DATOS.banco, TRANSFERENCIA_TITULAR: DATOS.titular, TRANSFERENCIA_RUT: DATOS.rut, TRANSFERENCIA_TIPO_CUENTA: DATOS.tipo_cuenta, TRANSFERENCIA_NUMERO_CUENTA: DATOS.numero_cuenta });
  });
  afterAll(() => {
    ENV.forEach((clave) => {
      if (envPrevio[clave] === undefined) delete process.env[clave];
      else process.env[clave] = envPrevio[clave];
    });
  });

  test('transferencia persistida al recargar → datos y referencia, sin Mercado Pago', async () => {
    flagsMock['pedido-pago-opcional'] = true;
    try {
      const out = await html({ ...base, metodo_pago: 'transferencia' });
      expect(out).toContain(DATOS.banco);
      expect(out).toContain(DATOS.numero_cuenta);
      expect(out).toContain('Transfiere e incluye la referencia');
      expect(out).not.toContain('Pagar con Mercado Pago');
    } finally { flagsMock['pedido-pago-opcional'] = false; }
  });

  test('flag OFF → conserva link legacy y el SQL no menciona metodo_pago', async () => {
    const out = await html({ ...base, mp_init_point: 'https://mp.example/checkout' });
    expect(out).toContain('Pagar con Mercado Pago');
    expect(out).toContain('https://mp.example/checkout');
    const consultas = mockSql.mock.calls.map((c) => String(c[0])).join(' ');
    expect(consultas).not.toContain('metodo_pago');
  });

  test('efectivo solo con delivery local activo', async () => {
    flagsMock['pedido-pago-opcional'] = true;
    try {
      expect(await html(local(true))).toContain('Pagar en efectivo');
      expect(await html(local(false))).not.toContain('Pagar en efectivo');
    } finally { flagsMock['pedido-pago-opcional'] = false; }
  });
});