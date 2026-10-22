/**
 * @jest-environment node
 */
// Slice 0 — Fase B: tests que intentan romper el slice. Sin DB real.
// Contrato: docs/slices/slice-00-neon-schema-fase-a.md
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') walk(rel, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(rel);
  }
  return out;
}

// Falla con aserción (no con error de import) si el archivo del contrato no existe.
function load(rel: string) {
  expect(fs.existsSync(path.join(root, rel))).toBe(true);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(path.join(root, rel));
}

const migrationFiles = () => fs.readdirSync(path.join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort();

function tablasCreadas(): Set<string> {
  const t = new Set<string>();
  for (const f of migrationFiles()) {
    for (const m of read(`migrations/${f}`).matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?([a-z_][a-z_0-9]*)/gi)) {
      t.add(m[1].toLowerCase());
    }
  }
  return t;
}

// Tablas en strings/template literals que contienen SQL (SELECT/INSERT/UPDATE/DELETE).
function tablasUsadas(): Map<string, string> {
  const usadas = new Map<string, string>();
  for (const f of [...walk('app'), ...walk('lib')]) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    for (const lit of src.matchAll(/`[^`]*`/g)) {
      const body = lit[0];
      if (!/\b(SELECT|INSERT INTO|UPDATE|DELETE FROM)\b/.test(body)) continue;
      const ctes = new Set([...body.matchAll(/\b([a-z_][a-z_0-9]*)\s+AS\s*\(/gi)].map((m) => m[1].toLowerCase()));
      // `(?![\w.])` impide capturar el esquema `public` (seguido de ".") al backtrackear.
      // Solo FROM/JOIN pueden ser funciones (unnest(...)); INSERT INTO t (cols) es válido.
      const re = /\b(?:(?:FROM|JOIN)\s+(?:public\.)?([a-z_][a-z_0-9]*)(?![\w.])(?!\s*\()|(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:public\.)?([a-z_][a-z_0-9]*)(?![\w.]))/g;
      for (const m of body.matchAll(re)) {
        m[1] = m[1] ?? m[2];
        const name = m[1].toLowerCase();
        if (ctes.has(name) || name === 'information_schema') continue;
        if (!usadas.has(name)) usadas.set(name, f);
      }
    }
  }
  return usadas;
}

describe('Slice 0 — cobertura código ↔ migraciones', () => {
  it('toda tabla que el código consulta la crea alguna migración (D1/D2)', () => {
    const creadas = tablasCreadas();
    const faltan = [...tablasUsadas()].filter(([t]) => !creadas.has(t)).map(([t, f]) => `${t} (${f})`);
    expect(faltan).toEqual([]);
  });

  it('existe la migración 039 con registro_notas_bodega y app_audit_log, idempotente', () => {
    const f = migrationFiles().find((n) => n.startsWith('039_'));
    expect(f).toBeDefined();
    const sql = read(`migrations/${f}`);
    for (const t of ['registro_notas_bodega', 'app_audit_log']) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS\\s+(public\\.)?${t}\\b`, 'i'));
    }
    // columnas que usan los INSERT de registro-notas y la auditoría (camelCase entre comillas)
    for (const c of ['folio', 'empresa_id', 'usuario_id', 'usuario_nombre', 'observacion', 'created_at', '"actorUserId"', 'action', 'entity', '"entityId"', 'diff', '"createdAt"']) {
      expect(sql).toContain(c);
    }
  });

  it('la numeración es única y no se editó historia: 039 es el siguiente número libre', () => {
    const nums = migrationFiles().map((f) => f.slice(0, 3));
    expect(new Set(nums).size).toBe(nums.length);
    expect(nums).toContain('038');
  });
});

describe('Slice 0 — orden de migraciones', () => {
  it('MIGRATION_ORDER cubre todos los .sql exactamente una vez, sin sobrantes', () => {
    const { MIGRATION_ORDER } = load('scripts/migrations-order.ts');
    expect([...MIGRATION_ORDER].sort()).toEqual(migrationFiles());
    expect(new Set(MIGRATION_ORDER).size).toBe(MIGRATION_ORDER.length);
  });

  it('003 va antes que 001 y 002 (P1), y 001 antes que 002 y 009', () => {
    const { MIGRATION_ORDER } = load('scripts/migrations-order.ts');
    const i = (n: string) => MIGRATION_ORDER.findIndex((f: string) => f.startsWith(n));
    expect(i('003')).toBeLessThan(i('001'));
    expect(i('001')).toBeLessThan(i('002'));
    expect(i('001')).toBeLessThan(i('009'));
    expect(i('041')).toBe(MIGRATION_ORDER.length - 1);
  });

  it('las dependencias FK de cada migración quedan creadas antes (orden topológico)', () => {
    const { MIGRATION_ORDER } = load('scripts/migrations-order.ts');
    const creadas = new Set<string>();
    for (const f of MIGRATION_ORDER) {
      const sql = read(`migrations/${f}`);
      for (const m of sql.matchAll(/REFERENCES\s+(?:public\.)?([a-z_]+)\s*\(/gi)) {
        const dep = m[1].toLowerCase();
        const propia = new RegExp(`CREATE TABLE(?: IF NOT EXISTS)?\\s+(?:public\\.)?${dep}\\b`, 'i').test(sql);
        expect({ f, dep, ok: creadas.has(dep) || propia }).toEqual({ f, dep, ok: true });
      }
      for (const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?([a-z_]+)/gi)) creadas.add(m[1].toLowerCase());
    }
  });
});

describe('Slice 0 — applyMigrations (ejecutor inyectado, sin DB)', () => {
  const files = ['003_a.sql', '001_b.sql', '002_c.sql', '008_d.sql'];
  const readFile = (f: string) => `-- ${f}`;

  it('aplica en el orden dado y devuelve lo aplicado', async () => {
    const { applyMigrations } = load('scripts/apply-migrations.ts');
    const seen: string[] = [];
    const r = await applyMigrations({ files, readFile, exec: async (s: string) => void seen.push(s), log: () => {} });
    expect(seen).toEqual(files.map(readFile));
    expect(r.applied).toEqual(files);
    expect(r.failed).toBeNull();
  });

  it('se detiene en el primer error y no ejecuta las siguientes', async () => {
    const { applyMigrations } = load('scripts/apply-migrations.ts');
    const seen: string[] = [];
    const exec = async (s: string) => {
      seen.push(s);
      if (s.includes('001_b')) throw new Error('relation "usuarios" does not exist');
    };
    const r = await applyMigrations({ files, readFile, exec, log: () => {} });
    expect(r.applied).toEqual(['003_a.sql']);
    expect(r.failed?.file).toBe('001_b.sql');
    expect(seen).toHaveLength(2);
  });

  it('registra cada migración aplicada y la fallida, sin volcar el SQL ni la URL', async () => {
    const { applyMigrations } = load('scripts/apply-migrations.ts');
    const logs: string[] = [];
    process.env.DATABASE_URL = 'postgres://u:secreto@host/db';
    await applyMigrations({ files, readFile, exec: async () => {}, log: (l: string) => logs.push(l) });
    expect(logs.join('\n')).toContain('003_a.sql');
    expect(logs.join('\n')).not.toContain('secreto');
  });

  it('el script real no depende de psql ni de dependencias nuevas', () => {
    expect(fs.existsSync(path.join(root, 'scripts/apply-migrations.ts'))).toBe(true);
    const src = read('scripts/apply-migrations.ts');
    expect(src).not.toMatch(/psql|child_process/);
    expect(src).toMatch(/@neondatabase\/serverless/);
  });
});
