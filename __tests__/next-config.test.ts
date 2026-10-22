import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf8');

describe('next.config.mjs (U1.3)', () => {
  it('fija outputFileTracingRoot a la raiz del proyecto', () => {
    expect(src).toMatch(/outputFileTracingRoot:\s*__dirname/);
    expect(src).toMatch(/fileURLToPath\(import\.meta\.url\)/);
  });
  it('no usa opciones obsoletas de Next 15', () => {
    expect(src).not.toMatch(/swcMinify|appDir|serverComponentsExternalPackages/);
  });
});
