import fs from 'fs';
import path from 'path';
import { formatSaldoPendiente } from '@/lib/utils';

describe('formatSaldoPendiente (CLP)', () => {
  test('pago parcial → "$150.000"', () => expect(formatSaldoPendiente(50000, 150000)).toBe('$150.000'));
  test('sin pago / pagada → null', () => {
    expect(formatSaldoPendiente(0, 150)).toBeNull();
    expect(formatSaldoPendiente(200, 0)).toBeNull();
  });
});

// Guard acotado al corte 2b (el guard global va en 2e).
const FILES = [
  'app/(app)/notas-venta/[id]/client_page.tsx', 'app/(app)/notas-venta/client_page.tsx',
  'app/(app)/deudores/client_page.tsx', 'components/AgregarANotaVentaModal.tsx',
  'components/AplicarSaldoFavorDialog.tsx', 'app/api/notas-venta/[id]/route.ts',
  'app/api/notas-venta/[id]/aplicar-saldo-favor/route.ts',
];
const BAD = /\bUSD\b|\bARS\b|AR\$|monto_usd|tipo_cambio|dolar|formatUSD|formatArsEquivalente|en-US|toFixed\(|\/api\/caja\/config/;

describe.each(FILES)('sin rastro USD/ARS: %s', (f) => {
  test('limpio', () => {
    const src = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
    expect(src.match(BAD)?.[0]).toBeUndefined();
  });
});
