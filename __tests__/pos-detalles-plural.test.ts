/**
 * Fase B — pos-detalles: plural del contador de ítems del POS.
 * "0 ítems", "1 ítem", "N ítems" (con tilde).
 */
import { formatItems } from '@/lib/utils';

describe('pos-detalles — plural de ítems', () => {
  test('0 → ítems', () => {
    expect(formatItems(0)).toBe('0 ítems');
  });

  test('1 → ítem (singular, con tilde)', () => {
    expect(formatItems(1)).toBe('1 ítem');
  });

  test('2 → ítems (plural, con tilde)', () => {
    expect(formatItems(2)).toBe('2 ítems');
  });

  test('cantidades negativas o raras no rompen el singular/plural', () => {
    expect(formatItems(-1)).toBe('-1 ítems');
  });
});
