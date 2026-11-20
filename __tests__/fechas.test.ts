/**
 * @jest-environment node
 *
 * FASE B — S3: agrupación de notas por día calendario en America/Santiago.
 * Riesgos cubiertos: 1 (UTC vs Chile), 2 (orden de entrada), 4 (anuladas),
 * 6 (total), 7 (año), 10 (fecha inválida).
 * Timestamps ISO completos a propósito: '2026-04-23' se parsea como medianoche UTC.
 */

import {
  normalizarFechaPostgres,
  claveSantiago,
  etiquetaDia,
  agruparPorDia,
} from '@/lib/fechas';

type Nota = { id: number; created_at: string; total?: number; estado?: string };

describe('claveSantiago — riesgo 1: día calendario chileno, no UTC', () => {
  test('23:30 del 19-nov y 00:30 del 20-nov caen en días distintos', () => {
    expect(claveSantiago('2026-11-20T02:30:00.000Z')).toBe('2026-11-19'); // 23:30 -03
    expect(claveSantiago('2026-11-20T03:30:00.000Z')).toBe('2026-11-20'); // 00:30 -03
  });

  test('cambio de horario de verano: la medianoche UTC sigue siendo 5-sep en Chile', () => {
    expect(claveSantiago('2026-09-06T02:30:00.000Z')).toBe('2026-09-05'); // 22:30 -04
    expect(claveSantiago('2026-09-06T03:30:00.000Z')).toBe('2026-09-05'); // 23:30 -04
    expect(claveSantiago('2026-09-06T04:30:00.000Z')).toBe('2026-09-06'); // 01:30 -03
  });

  test('retroceso de hora: dos instantes distintos, misma hora de pared, mismo día', () => {
    expect(claveSantiago('2026-04-05T02:30:00.000Z')).toBe('2026-04-04'); // 23:30 -03
    expect(claveSantiago('2026-04-05T03:30:00.000Z')).toBe('2026-04-04'); // 23:30 repetida, -04
  });

  test('acepta el formato crudo de Postgres y Date', () => {
    expect(claveSantiago('2026-11-20 02:30:00+00')).toBe('2026-11-19');
    expect(claveSantiago(new Date('2026-11-20T02:30:00.000Z'))).toBe('2026-11-19');
  });

  test('riesgo 10: fecha inválida devuelve cadena vacía, no lanza', () => {
    expect(claveSantiago('basura')).toBe('');
  });
});

describe('etiquetaDia — riesgo 7: año solo si no es el actual', () => {
  test('mismo año no muestra año', () => {
    expect(etiquetaDia('2026-11-19', 2026)).toBe('Jueves 19 de noviembre');
  });

  test('otro año muestra año', () => {
    expect(etiquetaDia('2025-12-31', 2026)).toBe('Miércoles 31 de diciembre de 2025');
  });

  test('clave vacía → etiqueta vacía', () => {
    expect(etiquetaDia('', 2026)).toBe('');
  });
});

describe('agruparPorDia — riesgos 1, 2, 4, 6, 10', () => {
  const A: Nota = { id: 3, created_at: '2026-11-20T14:00:00.000Z', total: 7000, estado: 'activa' };
  const B: Nota = { id: 2, created_at: '2026-11-20T03:30:00.000Z', total: 5000, estado: 'activa' };
  const C: Nota = { id: 1, created_at: '2026-11-20T02:30:00.000Z', total: 3000, estado: 'activa' };
  const D: Nota = { id: 4, created_at: '2026-11-19T15:00:00.000Z', total: 1000, estado: 'anulada' };

  test('agrupa por día chileno, cuenta activas y suma total (23:30 cae el 19)', () => {
    const grupos = agruparPorDia([A, B, C, D], '2026-11-20');
    expect(grupos.map((g) => g.clave)).toEqual(['2026-11-20', '2026-11-19']);
    expect(grupos[0]).toMatchObject({
      etiqueta: 'Viernes 20 de noviembre', activas: 2, total: 12000,
    });
    expect(grupos[0].notas.map((n) => n.id)).toEqual([3, 2]);
    expect(grupos[1]).toMatchObject({
      etiqueta: 'Jueves 19 de noviembre', activas: 1, total: 3000,
    });
    // La anulada se lista pero no cuenta ni suma.
    expect(grupos[1].notas.map((n) => n.id)).toEqual([1, 4]);
  });

  test('riesgo 2: input desordenado produce el mismo resultado', () => {
    const grupos = agruparPorDia([C, A, D, B], '2026-11-20');
    expect(grupos.map((g) => g.clave)).toEqual(['2026-11-20', '2026-11-19']);
    expect(grupos[0].notas.map((n) => n.id)).toEqual([3, 2]);
    expect(grupos[1].notas.map((n) => n.id)).toEqual([1, 4]);
  });

  test('riesgo 10: nota con fecha inválida no rompe y queda al final sin etiqueta', () => {
    const X: Nota = { id: 9, created_at: 'basura', total: 100, estado: 'activa' };
    const grupos = agruparPorDia([X, A], '2026-11-20');
    expect(grupos[0].clave).toBe('2026-11-20');
    expect(grupos[grupos.length - 1]).toMatchObject({ clave: '', etiqueta: '' });
    expect(grupos[grupos.length - 1].notas.map((n) => n.id)).toEqual([9]);
  });

  test('lista vacía → sin grupos', () => {
    expect(agruparPorDia([], '2026-11-20')).toEqual([]);
  });
});

describe('normalizarFechaPostgres (movida a lib/fechas)', () => {
  test('normaliza el formato crudo de Postgres', () => {
    expect(normalizarFechaPostgres('2026-11-20 11:32:33.928739+00'))
      .toBe('2026-11-20T11:32:33.928+00:00');
    expect(normalizarFechaPostgres('2026-11-20 11:32:33+0000'))
      .toBe('2026-11-20T11:32:33+00:00');
  });
});
