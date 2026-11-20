/**
 * B3: la fecha de /pedidos usa el texto crudo de Postgres, que Safari/iOS no
 * garantiza, y no fijaba zona Chile (un pedido de las 23:30 podía mostrar el
 * día siguiente). formatFecha normaliza, usa America/Santiago y devuelve el
 * texto original si la fecha es inválida.
 */
import { formatFecha } from '@/app/(app)/pedidos/client_page';

describe('B3: formatFecha de pedidos', () => {
  test('el formato crudo de Postgres se muestra como "20 nov 2026"', () => {
    expect(formatFecha('2026-11-20 11:32:33.928739+00')).toBe('20 nov 2026');
  });

  test('23:30 en Chile sigue siendo el 20 aunque el runner esté en otra zona', () => {
    // 2026-11-21 02:30 UTC = 23:30 del 20-nov en Chile (UTC-3).
    expect(formatFecha('2026-11-21 02:30:00+00')).toBe('20 nov 2026');
    // La zona Chile es explícita, no depende de la TZ del navegador/runner.
    const spy = jest.spyOn(Date.prototype, 'toLocaleDateString');
    formatFecha('2026-11-21 02:30:00+00');
    expect(spy).toHaveBeenCalledWith(
      'es-CL',
      expect.objectContaining({ timeZone: 'America/Santiago' }),
    );
    spy.mockRestore();
  });

  test('texto inválido devuelve el original sin lanzar', () => {
    expect(formatFecha('basura')).toBe('basura');
    expect(formatFecha('')).toBe('');
  });
});
