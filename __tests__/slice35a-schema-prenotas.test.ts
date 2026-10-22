/**
 * @jest-environment node
 *
 * Fase B — Slice 35a (Schema): Migration + tipos para anulación
 *
 * T0 — Interface CajaMovimiento.tipo expandida: contiene 'reembolso'
 * T1 — Migration: el archivo .sql con ADD COLUMN estado debe existir
 * T2 — Zod schema CajaMovimientoCreateSchema NO acepta 'reembolso'
 *       (guarda: que expandir la interface no expanda el schema accidentalmente)
 *
 * T0: ROJO hoy (interface no incluye 'reembolso'), VERDE después de Sub-slice 1
 * T1: ROJO hoy (migration no existe), VERDE después de Sub-slice 1
 * T2: VERDE hoy y siempre (guarda de regresión)
 */

import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════
// T0 — Interface CajaMovimiento.tipo debe incluir 'reembolso'
// ═══════════════════════════════════════════════════════════════════════
describe('T0 — Interface CajaMovimiento.tipo expandida', () => {
  it('ROJO: el archivo caja-mayor.spec.ts debe incluir literal "reembolso" en CajaMovimiento.tipo', () => {
    const specPath = path.resolve(__dirname, '..', 'docs', 'specs', 'caja-mayor.spec.ts');
    const content = fs.readFileSync(specPath, 'utf-8');

    // Buscar la línea de la interface CajaMovimiento (NO la del Zod schema)
    // Interface:   tipo: "cobro" | "gasto";
    // Zod schema:  tipo: z.enum(["cobro", "gasto"]),
    const tipoLine = content
      .split('\n')
      .find((l) =>
        l.includes('tipo:') &&
        !l.includes('z.enum') &&
        !l.includes('const') &&
        !l.includes('Schema')
      );

    expect(tipoLine).toBeDefined();

    // ROJO hoy: tipo: "cobro" | "gasto" — sin reembolso
    // Verde después: tipo: "cobro" | "gasto" | "reembolso"
    expect(tipoLine!).toContain('reembolso');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// T1 — Migration para ADD COLUMN estado en prenotas debe existir
// ═══════════════════════════════════════════════════════════════════════
describe('T1 — Migration: columna estado en prenotas', () => {
  it('ROJO: debe existir archivo migration que agregue ADD COLUMN estado a prenotas', () => {
    const migDir = path.resolve(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migDir).sort();

    // Buscar entre todos los archivos .sql uno que agregue estado a prenotas
    const migFiles = files.filter((f) => /^\d+_.*\.sql$/.test(f));
    const migConEstado = migFiles.find((f) => {
      const content = fs.readFileSync(path.join(migDir, f), 'utf-8');
      return (
        content.includes('prenotas') &&
        content.includes('estado') &&
        (content.includes('ADD COLUMN') || content.includes('CHECK'))
      );
    });

    // ROJO hoy: ningún archivo migration agrega estado a prenotas
    // Verde después: Sub-slice 1 crea la migration
    expect(migConEstado).toBeDefined();

    // Verificar contenido específico del CHECK
    const content = fs.readFileSync(path.join(migDir, migConEstado!), 'utf-8');
    expect(content).toContain('activa');
    expect(content).toContain('anulada');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// T2 — Zod schema de creación manual NO permite reembolso
// ═══════════════════════════════════════════════════════════════════════
describe('T2 — CajaMovimientoCreateSchema rechaza reembolso', () => {
  it('VERDE: el schema de creación manual NO debe aceptar tipo="reembolso" (nunca cambia)', async () => {
    const { CajaMovimientoCreateSchema } = await import(
      '@/docs/specs/caja-mayor.spec'
    );

    const payload = {
      fecha: '2026-07-09',
      tipo: 'reembolso',
      cuenta_id: 1,
      moneda: 'USD',
      monto: 100,
      forma_pago: 'efectivo',
    };

    const result = CajaMovimientoCreateSchema.safeParse(payload);

    // Pasa hoy: z.enum(["cobro","gasto"]) rechaza 'reembolso'
    // Pasa después: Sub-slice 1 NO toca el Zod schema
    expect(result.success).toBe(false);
    // Verificar que el error es en el campo tipo, no por otro motivo
    if (!result.success) {
      const tipoError = result.error.issues.find(
        (i) => i.path[0] === 'tipo'
      );
      expect(tipoError).toBeDefined();
    }
  });
});
