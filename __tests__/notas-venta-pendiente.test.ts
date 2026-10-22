/**
 * Fase B — "Pendiente: $" en la lista de Notas de Venta.
 *
 * La lista muestra "Pendiente: $X" debajo del Total SOLO cuando la nota
 * tiene pago parcial: total_pagado > 0 y saldo_pendiente > 0.
 *
 * Riesgos cubiertos (deben fallar en la implementación incorrecta):
 * - Sin ningún pago (total_pagado = 0) → NO se muestra (redundante con Total).
 * - Pago parcial → SÍ se muestra con el saldo pendiente.
 * - Pagada completa (saldo_pendiente = 0) → NO se muestra.
 * - No se cuele "Pendiente: $0.00" por ruido de punto flotante.
 */

import { formatSaldoPendiente } from '@/lib/utils';

describe('formatSaldoPendiente', () => {
  // Sin ningún pago → no se muestra
  it('total_pagado = 0 → null (no se muestra)', () => {
    expect(formatSaldoPendiente(0, 150)).toBeNull();
  });

  it('total_pagado = undefined → null', () => {
    expect(formatSaldoPendiente(undefined, 150)).toBeNull();
  });

  // Pago parcial → sí se muestra
  it('pago parcial (pagado 50, pendiente 150) → "$150"', () => {
    expect(formatSaldoPendiente(50, 150)).toBe('$150');
  });

  it('pago parcial con decimales → CLP entero', () => {
    expect(formatSaldoPendiente(50.25, 149.75)).toBe('$150');
  });

  // Pagada completa → no se muestra
  it('saldo_pendiente = 0 → null', () => {
    expect(formatSaldoPendiente(200, 0)).toBeNull();
  });

  it('saldo_pendiente = undefined → null', () => {
    expect(formatSaldoPendiente(200, undefined)).toBeNull();
  });

  // Guard float noise → no cuela $0.00
  it('pago mínimo (pagado 0.001) → null (evita mostrar pendiente sin pago real)', () => {
    expect(formatSaldoPendiente(0.001, 150)).toBeNull();
  });

  it('saldo residual mínimo (pendiente 0.003) → null (evita "$0.00")', () => {
    expect(formatSaldoPendiente(200, 0.003)).toBeNull();
  });
});
