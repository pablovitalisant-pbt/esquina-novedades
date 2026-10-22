/**
 * @jest-environment node
 */
// Slice 0 — Fase B: seed mínimo (empresa + admin). Sin DB real: sql mockeado.
// Contrato: scripts/seed-core.ts exporta validateSeedEnv(env) y runSeed(sql, env, hash?).
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');

function load() {
  const rel = 'scripts/seed-core.ts';
  expect(fs.existsSync(path.join(root, rel))).toBe(true);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(path.join(root, rel));
}

const ENV = { ADMIN_RUT: '11.111.111-1', ADMIN_NOMBRE: 'Admin Esquina', ADMIN_PASSWORD: 'Cl4ve-Segura-xyz' };

// sql falso: guarda cada query; emula una DB con estado mínimo para probar idempotencia.
function fakeSql() {
  const db = { empresas: [] as any[], usuarios: [] as any[], ue: new Set<string>() };
  const queries: { text: string; values: any[] }[] = [];
  const sql: any = (strings: TemplateStringsArray, ...values: any[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    queries.push({ text, values });
    if (/INSERT INTO empresas/i.test(text)) {
      if (db.empresas.some((e) => e.slug === values[1])) return Promise.resolve([]);
      db.empresas.push({ id: db.empresas.length + 1, nombre: values[0], slug: values[1] });
      return Promise.resolve([db.empresas[db.empresas.length - 1]]);
    }
    if (/SELECT[^;]*FROM empresas/i.test(text)) return Promise.resolve(db.empresas.map((e) => ({ id: e.id, slug: e.slug, nombre: e.nombre })));
    if (/INSERT INTO usuarios/i.test(text)) {
      if (db.usuarios.some((u) => u.rut === values[0])) return Promise.resolve([]);
      db.usuarios.push({ id: db.usuarios.length + 1, rut: values[0] });
      return Promise.resolve([db.usuarios[db.usuarios.length - 1]]);
    }
    if (/SELECT[^;]*FROM usuarios/i.test(text)) return Promise.resolve(db.usuarios);
    if (/INSERT INTO usuario_empresa/i.test(text)) {
      db.ue.add(`${values[0]}-${values[1]}`);
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  };
  return { sql, db, queries };
}
const hash = async (p: string) => `hash(${p.length})`;

describe('Slice 0 — validateSeedEnv', () => {
  it.each(['ADMIN_RUT', 'ADMIN_NOMBRE', 'ADMIN_PASSWORD'])('rechaza si falta %s', (k) => {
    const { validateSeedEnv } = load();
    const env: any = { ...ENV };
    delete env[k];
    expect(() => validateSeedEnv(env)).toThrow(new RegExp(k));
  });

  it('rechaza valores vacíos o solo espacios', () => {
    const { validateSeedEnv } = load();
    expect(() => validateSeedEnv({ ...ENV, ADMIN_PASSWORD: '   ' })).toThrow(/ADMIN_PASSWORD/);
  });

  it('el mensaje de error nunca contiene la contraseña', () => {
    const { validateSeedEnv } = load();
    try {
      validateSeedEnv({ ...ENV, ADMIN_RUT: '' });
    } catch (e: any) {
      expect(String(e.message)).not.toContain(ENV.ADMIN_PASSWORD);
    }
  });

  it('exige contraseña de largo mínimo razonable (≥ 10)', () => {
    const { validateSeedEnv } = load();
    expect(() => validateSeedEnv({ ...ENV, ADMIN_PASSWORD: 'admin123' })).toThrow(/ADMIN_PASSWORD/);
  });
});

describe('Slice 0 — runSeed', () => {
  it('crea la empresa "La Esquina de las Novedades" con slug la-esquina-de-las-novedades', async () => {
    const { runSeed } = load();
    const { sql, db } = fakeSql();
    await runSeed(sql, ENV, hash);
    expect(db.empresas).toEqual([{ id: 1, nombre: 'La Esquina de las Novedades', slug: 'la-esquina-de-las-novedades' }]);
  });

  it('crea 1 admin con rol admin y lo vincula a la empresa 1', async () => {
    const { runSeed } = load();
    const { sql, db, queries } = fakeSql();
    await runSeed(sql, ENV, hash);
    expect(db.usuarios).toHaveLength(1);
    expect(db.usuarios[0].rut).toBe(ENV.ADMIN_RUT);
    expect(queries.some((q) => /INSERT INTO usuarios/i.test(q.text) && /'admin'/.test(q.text))).toBe(true);
    expect([...db.ue]).toEqual(['1-1']);
  });

  it('guarda solo el hash: la contraseña en claro no viaja en ninguna query', async () => {
    const { runSeed } = load();
    const { sql, queries } = fakeSql();
    await runSeed(sql, ENV, hash);
    expect(JSON.stringify(queries)).not.toContain(ENV.ADMIN_PASSWORD);
    expect(queries.some((q) => q.values.includes(`hash(${ENV.ADMIN_PASSWORD.length})`))).toBe(true);
  });

  it('es idempotente: 2ª ejecución no agrega empresas ni usuarios', async () => {
    const { runSeed } = load();
    const { sql, db } = fakeSql();
    await runSeed(sql, ENV, hash);
    await runSeed(sql, ENV, hash);
    expect(db.empresas).toHaveLength(1);
    expect(db.usuarios).toHaveLength(1);
    expect(db.ue.size).toBe(1);
  });

  it('todo INSERT es idempotente (ON CONFLICT o NOT EXISTS)', async () => {
    const { runSeed } = load();
    const { sql, queries } = fakeSql();
    await runSeed(sql, ENV, hash);
    const inserts = queries.filter((q) => /INSERT INTO/i.test(q.text));
    expect(inserts.length).toBeGreaterThan(0);
    for (const q of inserts) expect(q.text).toMatch(/ON CONFLICT|NOT EXISTS/i);
  });

  it('no siembra datos demo: productos, catálogos, clientes, caja', async () => {
    const { runSeed } = load();
    const { sql, queries } = fakeSql();
    await runSeed(sql, ENV, hash);
    const tablas = queries.map((q) => q.text).join(' ');
    expect(tablas).not.toMatch(/INSERT INTO (productos|ubicaciones_bodega|catalogos|catalogo_items|clientes|caja_config|caja_cuentas)/i);
  });

  it('aborta si la empresa ya existe con id distinto de 1 (el código asume empresa_id=1)', async () => {
    const { runSeed } = load();
    const { sql, db } = fakeSql();
    db.empresas.push({ id: 7, nombre: 'Otra', slug: 'otra' });
    await expect(runSeed(sql, ENV, hash)).rejects.toThrow(/empresa/i);
  });
});

describe('Slice 0 — scripts/seed.ts (entrypoint)', () => {
  const src = fs.readFileSync(path.join(root, 'scripts/seed.ts'), 'utf8');

  it('no contiene datos de bazar-naty ni credenciales hardcodeadas', () => {
    expect(src).not.toMatch(/Bazar Naty|bazar-naty|admin123|bodega123|venta123/);
  });

  it('delega en seed-core y toma las credenciales de ADMIN_* del entorno', () => {
    expect(src).toMatch(/seed-core/);
    expect(src).toMatch(/process\.env/);
  });
});
