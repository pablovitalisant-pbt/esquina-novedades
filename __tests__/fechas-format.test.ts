/**
 * FASE B — Limpieza B: formatFecha/formatFechaHora compartidos y títulos con
 * día chileno. Riesgo: un texto de Postgres sin normalizar o un `new Date()`
 * del servidor (UTC) muestran el día siguiente después de las 21:00 de Chile.
 *
 * @jest-environment node
 */
import { formatFecha, formatFechaHora } from '@/lib/fechas';

describe('formatFecha', () => {
  test('formato de día/mes corto/año idéntico al de las pantallas', () => {
    expect(formatFecha('2026-11-20 11:32:33.928739+00')).toBe('20 nov 2026');
  });

  test('23:30 en Chile sigue siendo el 20 (zona explícita, no la del runner)', () => {
    expect(formatFecha('2026-11-21 02:30:00+00')).toBe('20 nov 2026');
  });

  test('opciones: mes largo para el PDF', () => {
    expect(formatFecha('2026-11-20T12:00:00Z', { month: 'long' })).toBe('20 de noviembre de 2026');
  });

  test('fecha inválida devuelve el texto original sin lanzar', () => {
    expect(formatFecha('basura')).toBe('basura');
    expect(formatFecha('')).toBe('');
  });
});

describe('formatFechaHora', () => {
  test('fecha + hora de pared chilena', () => {
    expect(formatFechaHora('2026-11-20 11:32:33.928739+00')).toBe('20 nov 2026, 08:32');
  });

  test('23:30 del 19 en Chile, no el 20', () => {
    expect(formatFechaHora('2026-11-20T02:30:00Z')).toBe('19 nov 2026, 23:30');
  });

  test('fecha inválida devuelve el texto original sin lanzar', () => {
    expect(formatFechaHora('no-es-fecha')).toBe('no-es-fecha');
  });
});
