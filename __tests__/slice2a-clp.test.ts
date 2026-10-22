import fs from 'fs';
import path from 'path';
import { formatCLP } from '@/lib/utils';

describe('formatCLP', () => {
  test('entero con puntos de miles', () => expect(formatCLP(1234567)).toBe('$1.234.567'));
  test('cero', () => expect(formatCLP(0)).toBe('$0'));
  test('redondea decimales', () => expect(formatCLP(1234.6)).toBe('$1.235'));
  test('NaN/null/undefined no lanzan', () => {
    expect(formatCLP(NaN)).toBe('—');
    expect(formatCLP(null as any)).toBe('—');
    expect(formatCLP(undefined as any)).toBe('—');
  });
});

// Guard acotado al corte 2a (el guard global va en 2e).
const FILES = [
  'lib/calcular-precio.ts', 'lib/inversion-mercaderia.ts', 'contexts/CarritoContext.tsx',
  'components/ProductCard.tsx', 'components/ProductDrawer.tsx', 'components/CarritoDrawer.tsx',
  'components/LandingPage.tsx', 'app/productos/page.tsx', 'app/productos/client_page.tsx',
  'app/catalogo/[slug]/page.tsx', 'app/catalogo/[slug]/client_page.tsx',
  'app/(app)/precios/client_page.tsx', 'app/(app)/pedidos/client_page.tsx',
  'app/(app)/clientes/client_page.tsx', 'app/(app)/admin/inversion-mercaderia/client_page.tsx',
];
const BAD = /\bUSD\b|\bARS\b|monto_usd|tipo_cambio|dolar|formatUSD|formatUsd|formatArsEquivalente|en-US|toFixed\(|caja_config|\/api\/caja\/config/;

describe.each(FILES)('sin rastro USD/ARS: %s', (f) => {
  test('limpio', () => {
    const src = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
    expect(src.match(BAD)?.[0]).toBeUndefined();
  });
});
