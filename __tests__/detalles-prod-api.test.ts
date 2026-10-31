/**
 * @jest-environment node
 *
 * Fase B — slice detalles-prod (P1): la API de Caja Mayor resuelve el nombre
 * del cliente desde `clientes` cuando el snapshot `nombre_cliente` es null.
 */

import { NextRequest } from 'next/server';

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/db', () => ({ sql: (...args: unknown[]) => sql(...args) }));

describe('detalles-prod — GET /api/caja/movimientos', () => {
  beforeEach(() => jest.clearAllMocks());

  it('devuelve el nombre del cliente desde la tabla clientes y hace LEFT JOIN', async () => {
    const { GET } = await import('@/app/api/caja/movimientos/route');
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });

    sql.mockResolvedValueOnce([
      {
        id: 1, fecha: '2026-10-31', tipo: 'cobro', cliente_id: 'c-uuid',
        nombre_cliente: 'Cliente desde tabla', cuenta_id: 1, cuenta_nombre: 'Caja',
        moneda: 'CLP', monto: 5000, forma_pago: 'efectivo', observaciones: null,
        empresa: 'la-esquina-de-las-novedades', es_credito: false,
        notas_imputadas: [], usuario_id: 7, usuario_nombre: 'Admin',
        created_at: '', updated_at: '',
      },
    ]);
    sql.mockResolvedValueOnce([{ total: 1 }]);
    sql.mockResolvedValueOnce([]);

    const res = await GET(new NextRequest('http://localhost/api/caja/movimientos'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data[0].data.nombre_cliente).toBe('Cliente desde tabla');

    const query = sql.mock.calls[0][0].join('');
    expect(query).toContain('LEFT JOIN public.clientes');
    expect(query).toContain('COALESCE(m.nombre_cliente, c.nombre)');
  });
});
