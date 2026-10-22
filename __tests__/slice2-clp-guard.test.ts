import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['app', 'components', 'lib', 'contexts', 'hooks', 'types', 'docs/specs'];
const BAD = /\bUSD\b|\bARS\b|monto_usd|tipo_cambio|dolar|formatUSD|formatArsEquivalente|roundUpToHalf|es-BO|en-US|toFixed\(/;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p, out); }
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

describe('Slice 2 CLP — guard global', () => {
  it('ningún archivo de producción menciona USD/ARS/dólar/en-US/toFixed', () => {
    const hits: string[] = [];
    for (const d of DIRS) for (const f of walk(path.join(ROOT, d))) {
      fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        if (BAD.test(l)) hits.push(`${path.relative(ROOT, f)}:${i + 1}: ${l.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it('api/caja/config ya no existe', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/api/caja/config/route.ts'))).toBe(false);
  });
});
