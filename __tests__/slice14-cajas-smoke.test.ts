import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const FILE = 'app/(app)/admin/caja-config/client_page.tsx';

describe('Slice 14 — smoke cuentas bancarias -> cajas', () => {

  test('NO contiene "Banco Central"', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, FILE), 'utf-8');
    expect(content).not.toContain('Banco Central');
  });

  test('NO contiene "Santander"', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, FILE), 'utf-8');
    expect(content).not.toContain('Santander');
  });

  test('NO contiene "cuentas bancarias"', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, FILE), 'utf-8');
    expect(content).not.toContain('cuentas bancarias');
  });

  test('SI contiene "Caja chica"', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, FILE), 'utf-8');
    expect(content).toContain('Caja chica');
  });
});
