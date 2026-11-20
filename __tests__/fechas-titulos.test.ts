/**
 * FASE B — audit #8: el título de la nota se generaba con new Date() y
 * toLocaleDateString('es-CL') SIN timeZone. En el servidor (UTC) una nota
 * creada a las 23:30 del 19-nov quedaba fechada el 20. Debe decir
 * "19 nov 2026" (14 casos reales en producción).
 *
 * @jest-environment node
 */
jest.mock('@/lib/db', () => ({ sql: jest.fn() }));
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));

import { sql } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { POST } from '@/app/api/notas-venta/route';
import { convertirPedido } from '@/lib/pedidos/convertir';

const sqlMock = sql as unknown as jest.Mock;
const sessionMock = getServerSession as unknown as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-20T02:30:00Z')); // 23:30 del 19 en Chile
  sessionMock.mockResolvedValue({ user: { id: 1, rol: 'admin', nombre: 'Pablo' } });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('POST /api/notas-venta — título con día chileno', () => {
  test('23:30 del 19-nov se guarda como "19 nov 2026"', async () => {
    sqlMock
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([{ id: 1 }]);

    const res = await POST({ json: async () => ({}) } as any);
    expect(res.status).toBe(200);

    const titulo = sqlMock.mock.calls[1][1] as string;
    expect(titulo).toContain('19 nov 2026');
    expect(titulo).not.toContain('20 nov 2026');
  });
});

describe('convertirPedido — título con día chileno', () => {
  test('pedido pagado/reservado creado a las 23:30 usa "19 nov 2026"', async () => {
    sqlMock
      .mockResolvedValueOnce([{ id: 'x', estado: 'pagado', cliente_id: 'c', stock_reservado: true, entrega_costo: 0 }])
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([{ codigo: 'A' }])
      .mockResolvedValueOnce([{ prenota_id: 5 }]);

    const r = await convertirPedido('x', 1, 'Pablo');
    expect(r.status).toBe(201);

    const params = sqlMock.mock.calls[3].slice(1) as unknown[];
    const titulo = params.find((v) => typeof v === 'string' && v.includes('Nota de Venta')) as string;
    expect(titulo).toContain('19 nov 2026');
    expect(titulo).not.toContain('20 nov 2026');
  });
});
