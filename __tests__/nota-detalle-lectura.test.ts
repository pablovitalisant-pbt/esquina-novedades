/**
 * @jest-environment node
 *
 * Fase B — N13 loader. Contrato: `lib/notas-venta/detalle.ts` exporta
 * `leerDetalleNota(id)`, el helper server que hoy vive inline en
 * app/api/notas-venta/[id]/route.ts. El módulo todavía no existe: ROJO por import.
 *
 * Riesgos cubiertos:
 * [x] Nota ausente → null (no lanza, no 404).
 * [x] Respuesta completa: total, tipo derivado, saldos, contacto y orden de
 *     items con la misma SQL actual (ORDER BY created_at ASC).
 */

const sql = jest.fn();

jest.mock('@/lib/db', () => ({ sql: (...args: any[]) => sql(...args) }));

import { leerDetalleNota } from '@/lib/notas-venta/detalle';

const nota = {
  id: 12,
  titulo: 'Nota 12',
  cliente_id: 'c1',
  cliente_nombre: 'Ana',
  cliente_direccion: 'Calle 1',
  cliente_telefono: '999',
};

describe('leerDetalleNota', () => {
  beforeEach(() => jest.resetAllMocks());

  test('nota ausente → null', async () => {
    sql.mockResolvedValueOnce([]);
    expect(await leerDetalleNota(12)).toBeNull();
  });

  test('respuesta completa: total, tipo, saldos, contacto y orden de items', async () => {
    sql
      .mockResolvedValueOnce([nota])
      .mockResolvedValueOnce([
        { codigo: 'P1', modalidad: 'detalle', subtotal: '1000' },
        { codigo: 'P2', modalidad: 'detalle', subtotal: '500' },
      ])
      .mockResolvedValueOnce([{ total: '300' }])
      .mockResolvedValueOnce([{ total: '100' }])
      .mockResolvedValueOnce([{ disponible: '50' }]);

    const res = await leerDetalleNota(12);

    expect(res).toMatchObject({
      id: 12,
      cliente_nombre: 'Ana',
      cliente_direccion: 'Calle 1',
      cliente_telefono: '999',
      tipo: 'menor',
      total: 1500,
      total_pagado: 300,
      saldo_favor_aplicado: 100,
      saldo_pendiente: 1100,
      cliente_saldo_favor: 50,
    });
    expect(res!.items.map((i: any) => i.codigo)).toEqual(['P1', 'P2']);
    expect(sql.mock.calls[1][0].join('')).toMatch(/ORDER BY created_at ASC/);
  });
});
