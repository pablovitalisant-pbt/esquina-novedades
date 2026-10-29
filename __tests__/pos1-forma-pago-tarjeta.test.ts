/**
 * @jest-environment node
 *
 * FASE B — Slice pos1: TARJETA como forma de pago.
 * Deben fallar en ROJO antes de implementar.
 */

import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';

const getServerSession = jest.fn();
const sql = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/db', () => ({ sql: (...args: any[]) => sql(...args) }));

const PROJECT_ROOT = path.resolve(__dirname, '..');

async function post(body: any) {
  const { POST } = await import('@/app/api/notas-venta/[id]/pagar/route');
  const req = new NextRequest('http://localhost/api/notas-venta/1/pagar', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  return POST(req, { params: Promise.resolve({ id: '1' }) });
}

const nota = { id: 1, estado: 'activa', cliente_id: 5, nombre_cliente: 'Juan' };
const cobro = {
  id: 1, fecha: '2026-10-29', tipo: 'cobro', cliente_id: 5, nombre_cliente: 'Juan',
  cuenta_id: 1, monto: 5000, forma_pago: 'tarjeta', observaciones: null,
  empresa: 'esquina', es_credito: false, usuario_id: 7, usuario_nombre: 'Admin',
};

describe('pos1 — POST /pagar acepta tarjeta', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: '7', rol: 'admin', nombre: 'Admin' } });
  });

  it('201 y persiste forma_pago = tarjeta', async () => {
    sql.mockResolvedValueOnce([nota]);
    sql.mockResolvedValueOnce([{ total: 5000 }]);
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([cobro]);

    const res = await post({ cuenta_id: 1, monto: 5000, forma_pago: 'tarjeta' });
    expect(res.status).toBe(201);
    expect(sql.mock.calls[3]).toContain('tarjeta');
  });

  it('400 si la forma de pago no es válida', async () => {
    const res = await post({ cuenta_id: 1, monto: 5000, forma_pago: 'bitcoin' });
    expect(res.status).toBe(400);
  });
});

describe('pos1 — la UI ofrece Tarjeta', () => {
  it('PagarNotaDialog muestra la opción Tarjeta y la incluye en el tipo', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'components/PagarNotaDialog.tsx'),
      'utf-8'
    );
    expect(src).toMatch(/<option value="tarjeta">Tarjeta<\/option>/);
    expect(src).toMatch(/'tarjeta'/);
  });

  it('caja-mayor etiqueta tarjeta en el registro y en la tabla', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'app/(app)/caja-mayor/client_page.tsx'),
      'utf-8'
    );
    expect(src).toMatch(/Tarjeta/);
    expect(src).toMatch(/["']tarjeta["']/);
  });

  it('los schemas de caja/movimientos aceptan tarjeta', () => {
    const spec = fs.readFileSync(
      path.join(PROJECT_ROOT, 'docs/specs/caja-mayor.spec.ts'),
      'utf-8'
    );
    expect(spec).toMatch(/z\.enum\(\[[^\]]*["']tarjeta["']/);
    expect(spec).toMatch(/forma_pago:\s*[^;\n]*["']tarjeta["']/);
  });
});
