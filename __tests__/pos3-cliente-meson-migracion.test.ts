/**
 * Fase B — pos3: migración del Cliente de mesón.
 */
import fs from 'fs';
import path from 'path';
import { MIGRATION_ORDER } from '@/scripts/migrations-order';

const ROOT = path.resolve(__dirname, '..');
const SQL = fs.readFileSync(path.join(ROOT, 'migrations/048_cliente_meson.sql'), 'utf-8');

describe('pos3 — migración 048', () => {
  test('inserta el cliente genérico por RUT de forma idempotente', () => {
    expect(SQL).toMatch(/66\.666\.666-6/);
    expect(SQL).toMatch(/Cliente de mesón/);
    expect(SQL).toMatch(/INSERT INTO public\.clientes/i);
    expect(SQL).toMatch(/WHERE NOT EXISTS/i);
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS rut/i);
  });

  test('está registrada en el orden de migraciones', () => {
    expect(MIGRATION_ORDER).toContain('048_cliente_meson.sql');
    expect(MIGRATION_ORDER.indexOf('048_cliente_meson.sql'))
      .toBe(MIGRATION_ORDER.length - 1);
  });
});
