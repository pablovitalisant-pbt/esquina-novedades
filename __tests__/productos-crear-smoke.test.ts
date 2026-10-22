/**
 * Fase B — Crear productos nuevos: POST /api/productos + Dialog frontend
 *
 * Contrato S1: costo y margen_pct son obligatorios; prcventa lo calcula el servidor.
 * Riesgos: INSERT a DB (duplicado por unique constraint), renderizado condicional (botón solo admin).
 * No aplican: middleware/permisos (auth inline en route), variables de entorno (no afecta).
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ROUTE_FILE = path.join(PROJECT_ROOT, 'app/api/productos/route.ts');
const DRAWER_FILE = path.join(PROJECT_ROOT, 'components/ProductDrawer.tsx');
const CLIENT_FILE = path.join(PROJECT_ROOT, 'app/(app)/precios/client_page.tsx');

describe('crear productos — smoke', () => {

  describe('POST /api/productos — ruta', () => {
    const content = fs.readFileSync(ROUTE_FILE, 'utf-8');

    // Helper: aislar el bloque de POST del resto del archivo (GET no contamina)
    const postBlock = () => {
      const idx = content.indexOf('export async function POST');
      if (idx === -1) return '';
      // Desde POST hasta el próximo 'export' o fin de archivo
      const rest = content.slice(idx);
      const endIdx = rest.indexOf('\nexport', 1);
      return endIdx === -1 ? rest : rest.slice(0, endIdx);
    };

    test('exporta función POST', () => {
      expect(content).toMatch(/export\s+(async\s+)?function\s+POST/);
    });

    test('valida sesión (401 si no autenticado)', () => {
      const block = postBlock();
      expect(block).toContain('401');
    });

    test('restringe a rol admin (403 si no admin)', () => {
      const block = postBlock();
      expect(block).toContain('admin');
      expect(block).toContain('403');
    });

    test('valida costo > 0 (400)', () => {
      const block = postBlock();
      expect(block).toContain('costo');
      expect(block).toContain('400');
    });

    test('valida margen_pct >= 0 (400)', () => {
      const block = postBlock();
      expect(block).toContain('margen');
      expect(block).toContain('400');
    });

    test('prcventa lo calcula el servidor (importa calcularPrecio)', () => {
      const block = postBlock();
      expect(block).toMatch(/calcularPrecio/);
      // No debe validar prcventa del body como obligatorio
      expect(block).not.toMatch(/body\.prcventa/);
    });

    test('detecta código duplicado (409)', () => {
      const block = postBlock();
      expect(block).toMatch(/409|Ya existe|duplicado|ON CONFLICT/);
    });

    test('INSERT tiene columnas: margen_pct, cantcaja, es_nuevo=true, umed', () => {
      const block = postBlock();
      const insertMatch = block.match(/INSERT\s+INTO\s+productos[\s\S]*?RETURNING/);
      expect(insertMatch).not.toBeNull();
      const insertSql = insertMatch?.[0] || '';
      expect(insertSql).toMatch(/margen_pct/);
      expect(insertSql).toMatch(/cantcaja/);
      expect(insertSql).toMatch(/umed/);
      expect(insertSql).toMatch(/es_nuevo/);
    });

    test('cantcaja: se lee del body con default 1 (variable, no literal en INSERT)', () => {
      const block = postBlock();
      expect(block).toMatch(/cantcajaNum/);                       // variable con default
      expect(block).toMatch(/: 1\b/);                             // default 1 si no se envía
      expect(block).not.toMatch(/'U'\s*,\s*1\s*,\s*0\s*,\s*0/);  // cantcaja ya no es literal 1
    });

    test('cantcaja: valida entero >= 1 → 400 "Cantidad por caja debe ser al menos 1"', () => {
      const block = postBlock();
      expect(block).toMatch(/Cantidad por caja debe ser al menos 1/);
      expect(block).toMatch(/400/);
    });
  });

  describe('ProductDrawer — null guard en prcminimo', () => {
    const content = fs.readFileSync(DRAWER_FILE, 'utf-8');

    test('prcminimo usa optional chaining o guard contra null', () => {
      // Debe proteger contra producto.prcminimo === null
      // Patrón: producto.prcminimo?.toString() ?? ''
      expect(content).toMatch(/prcminimo\?\.toString/);
    });
  });

  describe('Precios client_page — botón + Dialog + precio calculado', () => {
    const content = fs.readFileSync(CLIENT_FILE, 'utf-8');

    test('importa Dialog de shadcn', () => {
      expect(content).toMatch(/from.*dialog/);
    });

    test('tiene botón para admin (visible solo si rol admin)', () => {
      expect(content).toMatch(/Agregar producto/i);
      expect(content).toMatch(/admin/);
    });

    test('importa toast de sonner', () => {
      expect(content).toMatch(/toast.*sonner/);
    });

    test('precio de venta es calculado desde costo + margen', () => {
      expect(content).toMatch(/precioCalculado/);
      expect(content).toMatch(/Math\.round.*Number.*crearCosto.*\*.*\(1.*Number.*crearMargen.*100.*100.*100/);
    });

    test('costo y margen_pct son requeridos en el POST body', () => {
      expect(content).toMatch(/costo.*Number/);
      expect(content).toMatch(/margen_pct/);
      // prcventa ya no se envía en el body del POST
      const postBodyMatch = content.match(/JSON\.stringify\([\s\S]*?\}\)\)/);
      const postBody = postBodyMatch ? postBodyMatch[0] : '';
      expect(postBody).not.toMatch(/prcventa/);
    });

    test('modal tiene input "Unidades por caja" (crearCantCaja) con min 1 y step 1', () => {
      expect(content).toMatch(/crearCantCaja/);
      expect(content).toMatch(/Unidades por caja/i);
      expect(content).toMatch(/min="1"/);
      expect(content).toMatch(/step="1"/);
    });

    test('costo aclara que es por unidad bajo el label', () => {
      expect(content).toMatch(/Costo por unidad/i);
    });

    test('payload POST incluye cantcaja (undefined si vacío)', () => {
      // El body del POST es un objeto literal sin anidar: JSON.stringify({ ... })
      const postBodyMatch = content.match(/JSON\.stringify\(\{[\s\S]*?\}\)/);
      const postBody = postBodyMatch ? postBodyMatch[0] : '';
      expect(postBody).toMatch(/cantcaja/);
    });
  });
});
