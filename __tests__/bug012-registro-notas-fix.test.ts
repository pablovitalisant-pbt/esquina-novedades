/**
 * BUG-012 + BUG-013: bodega/registro-notas — empresaId=2 (empresa eliminada)
 * y header Empresa huerfano en tabla.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const CLIENT = 'app/(app)/bodega/registro-notas/client_page.tsx';

describe('BUG-012 — empresaId no puede ser 2 (empresa eliminada en migracion 018)', () => {

  const content = fs.readFileSync(path.join(ROOT, CLIENT), 'utf-8');

  test('empresaId NO hardcodea valor 2', () => {
    // Despues del fix: useState<number>(2) debe ser useState<number>(1)
    // o mejor: const empresaId = 1 sin state
    expect(content).not.toMatch(/useState<number>\(2\)/);
  });

  test('empresaId es 1 (unica empresa existente)', () => {
    expect(content).toMatch(/empresaId.*=.*1/);
  });
});

describe('BUG-013 — tabla: header Empresa eliminado (ya no hay columna en body)', () => {

  const content = fs.readFileSync(path.join(ROOT, CLIENT), 'utf-8');

  test('NO existe <th>Empresa</th> en el thead', () => {
    expect(content).not.toMatch(/<th[^>]*>Empresa<\/th>/);
  });

  test('Numero de <th> coincide con patron de <td> por fila', () => {
    // Contamos headers en el thead
    const theadMatch = content.match(/<thead[^>]*>([\s\S]*?)<\/thead>/);
    const theadContent = theadMatch ? theadMatch[1] : '';
    const thCount = (theadContent.match(/<th/g) || []).length;

    // Contamos TDs en la primera fila del tbody
    const tbodyMatch = content.match(/<tbody>[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>/);
    const firstRow = tbodyMatch ? tbodyMatch[1] : '';
    const tdCount = (firstRow.match(/<td/g) || []).length;

    // Deben coincidir (o al menos no tener header extra para Empresa)
    expect(thCount).toBe(tdCount);
  });
});
