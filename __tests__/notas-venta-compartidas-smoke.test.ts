/**
 * Fase B — Notas de venta visibles y operables por todos (admin + vendedor).
 *
 * Contrato: se quita el filtro `usuario_id = <actual>` en lectura y escritura de
 * prenotas. GET lista / GET+PATCH+DELETE [id] dejan de filtrar por dueño.
 * POST titula la nota con el nombre del creador (`Nota de Venta #n de <nombre> — fecha`)
 * para distinguir notas de usuarios distintos con la misma numeración por creador.
 *
 * Riesgos: numeración por creador (COUNT WHERE usuario_id) se mantiene; solo se
 * agrega el nombre al título. items/pagar/reembolsar ya no filtraban (sin cambios).
 * No afecta middleware/roles/env/DB (solo se quita filtro; guard bodeguero sigue).
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const LIST_ROUTE = path.join(PROJECT_ROOT, 'app/api/notas-venta/route.ts');
const DETAIL_ROUTE = path.join(PROJECT_ROOT, 'app/api/notas-venta/[id]/route.ts');
const CLIENT_LIST = path.join(PROJECT_ROOT, 'app/(app)/notas-venta/client_page.tsx');
const CLIENT_DETAIL = path.join(PROJECT_ROOT, 'app/(app)/notas-venta/[id]/client_page.tsx');

describe('notas-venta compartidas — smoke', () => {

  describe('GET /api/notas-venta — lista', () => {
    const content = fs.readFileSync(LIST_ROUTE, 'utf-8');
    const getBlock = () => {
      const idx = content.indexOf('export async function GET');
      if (idx === -1) return '';
      const rest = content.slice(idx);
      const endIdx = rest.indexOf('\nexport', 1);
      return endIdx === -1 ? rest : rest.slice(0, endIdx);
    };

    test('NO filtra por usuario_id (todas las notas activas)', () => {
      const block = getBlock();
      expect(block).toMatch(/FROM public\.prenotas/);
      expect(block).not.toMatch(/usuario_id/);
    });

    test('mantiene la exclusión de notas anuladas', () => {
      const block = getBlock();
      expect(block).toMatch(/estado != 'anulada'/);
    });
  });

  describe('POST /api/notas-venta — título con nombre del creador', () => {
    const content = fs.readFileSync(LIST_ROUTE, 'utf-8');
    const postBlock = () => {
      const idx = content.indexOf('export async function POST');
      if (idx === -1) return '';
      const rest = content.slice(idx);
      const endIdx = rest.indexOf('\nexport', 1);
      return endIdx === -1 ? rest : rest.slice(0, endIdx);
    };

    test('título incluye el nombre del creador (numeración por creador + nombre)', () => {
      const block = postBlock();
      expect(block).toMatch(/usuarioNombre/);
      expect(block).toMatch(/Nota de Venta #/);
      expect(block).toMatch(/de \$\{usuarioNombre\}/);
    });

    test('titulo_base guarda el mismo valor (PATCH lo reusa al asignar cliente)', () => {
      const block = postBlock();
      expect(block).toMatch(/titulo_base/);
    });
  });

  describe('GET/PATCH/DELETE /api/notas-venta/[id] — sin filtro de dueño', () => {
    const content = fs.readFileSync(DETAIL_ROUTE, 'utf-8');

    test('el archivo NO contiene ningún filtro usuario_id en SQL', () => {
      // Tras el slice, prenotas/[id] no referencia usuario_id en ninguna query.
      expect(content).not.toMatch(/usuario_id/);
    });

    test('mantiene el guard de rol bodeguero (403)', () => {
      expect(content).toMatch(/bodeguero/);
      expect(content).toMatch(/403/);
    });
  });

  describe('Frontend — queries offline sin filtro + copy', () => {
    test('lista: query offline NO filtra por p.usuario_id', () => {
      const content = fs.readFileSync(CLIENT_LIST, 'utf-8');
      expect(content).not.toMatch(/p\.usuario_id/);
    });

    test('detalle: query offline NO filtra por p.usuario_id', () => {
      const content = fs.readFileSync(CLIENT_DETAIL, 'utf-8');
      expect(content).not.toMatch(/p\.usuario_id/);
    });

    test('lista: texto vacío no posesivo', () => {
      const content = fs.readFileSync(CLIENT_LIST, 'utf-8');
      expect(content).toMatch(/No hay notas de venta/);
    });
  });
});
