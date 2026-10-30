/**
 * @jest-environment node
 */
// Slice 9a — Fase B: migración 044 (Mercado Pago) + usuario sistema del webhook.
import fs from 'fs';
import path from 'path';
import { compareSync } from 'bcryptjs';

const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const migracion = () => {
  const f = path.join(root, 'migrations/044_mercadopago.sql');
  expect(fs.existsSync(f)).toBe(true); // falla con aserción si aún no existe
  return fs.readFileSync(f, 'utf8');
};

describe('Migración 044 — columnas de Mercado Pago', () => {
  it('agrega las 4 columnas de forma idempotente y nullable', () => {
    const sql = migracion();
    for (const c of ['mp_init_point', 'mp_fecha_pago', 'mp_revision_motivo', 'caja_movimiento_id']) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${c}\\b`, 'i'));
    }
    expect(sql).toMatch(/mp_init_point\s+TEXT/i);
    expect(sql).toMatch(/mp_fecha_pago\s+TIMESTAMPTZ/i);
    expect(sql).toMatch(/mp_revision_motivo\s+TEXT/i);
  });

  it('caja_movimiento_id es UUID con FK a caja_movimientos (id UUID desde 028) y SET NULL', () => {
    const sql = migracion();
    expect(sql).toMatch(/caja_movimiento_id\s+UUID[\s\S]*?REFERENCES\s+(public\.)?caja_movimientos\s*\(\s*id\s*\)\s+ON DELETE SET NULL/i);
  });

  it('índice único parcial para idempotencia del cobro', () => {
    const sql = migracion();
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS\s+pedidos_caja_movimiento_unique[\s\S]*?ON\s+(public\.)?pedidos\s*\(\s*caja_movimiento_id\s*\)\s*WHERE\s+caja_movimiento_id IS NOT NULL/i);
  });
});

describe('Migración 044 — estado revision', () => {
  it('reemplaza el CHECK conservando todos los estados previos y agregando revision', () => {
    const sql = migracion();
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS\s+pedidos_estado_check/i);
    expect(sql).toMatch(/ADD CONSTRAINT\s+pedidos_estado_check/i);
    const check = sql.match(/pedidos_estado_check[\s\S]*?CHECK\s*\(\s*estado IN\s*\(([\s\S]*?)\)\s*\)/i);
    expect(check).not.toBeNull();
    for (const e of ['pendiente', 'convertido', 'descartado', 'pendiente_pago', 'pagado', 'rechazado', 'expirado', 'pagado_tardio', 'revision']) {
      expect(check![1]).toMatch(new RegExp(`'${e}'`));
    }
  });
});

describe('Migración 044 — usuario sistema del webhook', () => {
  it('crea SISTEMA-MP inactivo, rol vendedor, idempotente por rut', () => {
    const sql = migracion();
    const m = sql.match(/INSERT INTO\s+(public\.)?usuarios[\s\S]*?VALUES\s*\(\s*'SISTEMA-MP'\s*,\s*'Mercado Pago'\s*,\s*'vendedor'\s*,\s*'([^']*)'\s*,\s*(true|false)\s*\)[\s\S]*?ON CONFLICT\s*\(\s*rut\s*\)\s*DO NOTHING/i);
    expect(m).not.toBeNull();
    expect(m![3].toLowerCase()).toBe('false'); // inactivo: no puede iniciar sesión
  });

  it('el password del usuario sistema nunca es aceptado por bcrypt', () => {
    const sql = migracion();
    const m = sql.match(/VALUES\s*\(\s*'SISTEMA-MP'\s*,\s*'Mercado Pago'\s*,\s*'vendedor'\s*,\s*'([^']*)'/i);
    expect(m).not.toBeNull();
    const password = m![1];
    expect(password.length).not.toBe(60); // un hash bcrypt mide 60
    expect(compareSync('cualquiera', password)).toBe(false);
    expect(compareSync('', password)).toBe(false);
  });

  it('lib/auth.ts exige activo = true (el usuario sistema no puede iniciar sesión)', () => {
    const auth = read('lib/auth.ts');
    expect(auth).toMatch(/FROM\s+usuarios[\s\S]*?activo\s*=\s*true/i);
  });
});

describe('MIGRATION_ORDER', () => {
  it('incluye 044 exactamente una vez', () => {
    const { MIGRATION_ORDER } = require('../scripts/migrations-order');
    expect(MIGRATION_ORDER.filter((f: string) => f === '044_mercadopago.sql')).toHaveLength(1);
  });

  it('no edita la migración 043 ya aplicada', () => {
    const sql = read('migrations/043_pedidos_reserva.sql');
    expect(sql).not.toMatch(/'revision'|mp_init_point|caja_movimiento_id/i);
  });
});
