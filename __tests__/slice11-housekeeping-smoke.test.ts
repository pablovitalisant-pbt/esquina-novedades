import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

const DELETED_FILES = [
  'docs/specs/company-switcher.contract.ts',
  'docs/specs/company-switcher-mobile.contract.ts',
];

const DELETED_DIRS = [
  'app/(app)/catalog-image',
  'app/(app)/clientes-nuevos',
  'app/(app)/prenotas',
  'app/api/admin/categorizar-productos',
  'app/api/caja/dolar-observado',
  'app/api/catalog-image',
  'app/api/conversion-sugerencias',
  // 'app/api/cron' reintroducido en Slice 8c (liberar-reservas), ya no es legado
  'components/catalog-image',
  'lib/services',
  'tests/lib',
];

describe('Slice 11 — smoke housekeeping', () => {

  test.each(DELETED_FILES)('%s NO existe en disco', (file) => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, file))).toBe(false);
  });

  test.each(DELETED_DIRS)('%s NO existe en disco', (dir) => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, dir))).toBe(false);
  });

  // Guard: MVP dirs que deben seguir existiendo
  test('app/api/catalogos/public SI existe (MVP)', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'app/api/catalogos/public'))).toBe(true);
  });
});
