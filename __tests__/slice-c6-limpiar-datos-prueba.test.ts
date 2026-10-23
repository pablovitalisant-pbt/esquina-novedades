import {
  PEDIDOS,
  CODIGOS,
  PLAN,
  CONTEO,
  parseArgs,
  validarHost,
} from '@/scripts/limpiar-datos-prueba';

describe('C6 — plan de limpieza de datos de prueba', () => {
  it('todo DELETE lleva WHERE sobre una lista explícita', () => {
    for (const paso of PLAN) {
      expect(paso.sql).toMatch(/^DELETE FROM /);
      expect(paso.sql).toMatch(/ WHERE /);
      expect(paso.sql).toMatch(/= ANY\(\$\d+::(uuid|int|text)\[\]\)/);
    }
  });

  it('respeta el orden de las FKs', () => {
    const pos = (tabla: string) => PLAN.findIndex((p) => p.tabla === tabla);
    expect(pos('caja_movimiento_notas')).toBeLessThan(pos('prenotas'));
    expect(pos('pedidos')).toBeLessThan(pos('prenotas'));
    expect(pos('caja_movimiento_notas')).toBeLessThan(pos('caja_movimientos'));
    expect(pos('catalogo_items')).toBeLessThan(pos('productos'));
    expect(pos('clientes')).toBeGreaterThan(pos('prenotas'));
    expect(pos('productos')).toBe(PLAN.length - 1);
  });

  it('exige confirmar el host de DATABASE_URL', () => {
    const url = 'postgresql://u:p@ep-proud-hall-b6nxrz4m-pooler.neon.tech/neondb';
    expect(validarHost(url, 'ep-proud-hall-b6nxrz4m-pooler.neon.tech')).toBe(
      'ep-proud-hall-b6nxrz4m-pooler.neon.tech'
    );
    expect(() => validarHost(url, null)).toThrow();
    expect(() => validarHost(url, 'otro-host.neon.tech')).toThrow();
  });

  it('dry-run es el modo por defecto y solo hace SELECT', () => {
    expect(parseArgs([]).ejecutar).toBe(false);
    expect(parseArgs(['--host=x']).ejecutar).toBe(false);
    expect(parseArgs(['--host=x', '--ejecutar']).ejecutar).toBe(true);
    for (const c of CONTEO) {
      expect(c.sql).toMatch(/^SELECT /i);
      expect(c.sql).not.toMatch(/\b(DELETE|INSERT|UPDATE)\b/i);
    }
  });

  it('los filtros son los ids/códigos aprobados', () => {
    expect(PEDIDOS).toEqual([
      'afb8e9f4-0c9c-495d-9216-b1b4276b8613',
      'e14b5bf3-9b48-42ca-b25c-5581ba8259ce',
      '67181656-22d3-4a80-8f63-6efc18d3d45d',
    ]);
    expect(CODIGOS).toEqual([
      'DEMO-001',
      'DEMO-002',
      'DEMO-003',
      'DEMO-004',
      'DEMO-005',
    ]);
  });
});
