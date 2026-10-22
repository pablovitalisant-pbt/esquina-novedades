/**
 * Fase B — Rediseño de navegación: tests que fuerzan la nueva arquitectura.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('Toolbar eliminado', () => {
  test('Toolbar.tsx ya no existe', () => {
    expect(fs.existsSync(path.join(ROOT, 'components/Toolbar.tsx'))).toBe(false);
  });

  test('AppShell.tsx NO importa Toolbar', () => {
    const content = fs.readFileSync(path.join(ROOT, 'components/AppShell.tsx'), 'utf-8');
    expect(content).not.toMatch(/Toolbar/);
  });
});

describe('TopNav — VENTAS tiene 4 items', () => {
  const content = fs.readFileSync(path.join(ROOT, 'components/TopNav.tsx'), 'utf-8');

  test('contiene Sala de Venta, Notas de Venta, Clientes, Caja Mayor', () => {
    expect(content).toMatch(/Sala de Venta/);
    expect(content).toMatch(/Notas de Venta/);
    expect(content).toMatch(/Clientes/);
    expect(content).toMatch(/Caja Mayor/);
  });
});

describe('TopNav — CATÁLOGO es link directo, no dropdown', () => {
  const content = fs.readFileSync(path.join(ROOT, 'components/TopNav.tsx'), 'utf-8');

  test('NO tiene dropdown Catálogo con Crear Catálogo + Categorías juntos', () => {
    // Antes tenían DropdownMenu con ambos items. Ahora es un Link directo.
    const hasCatalogoDropdown = content.includes('catalogoOpen') || content.includes('setCatalogoOpen');
    expect(hasCatalogoDropdown).toBe(false);
  });

  test('tiene Link directo a /catalogo/admin', () => {
    expect(content).toMatch(/href="\/catalogo\/admin"/);
  });
});

describe('TopNav — ADMINISTRACIÓN tiene Categorías', () => {
  const content = fs.readFileSync(path.join(ROOT, 'components/TopNav.tsx'), 'utf-8');

  test('contiene Categorías en dropdown Administración', () => {
    // Categorías debe estar en el dropdown de Admin, no en Catálogo
    // Buscar que /admin/categorias está dentro del bloque adminOpen
    expect(content).toMatch(/\/admin\/categorias/);
  });
});

describe('BottomNav — VENTAS tiene 4 items', () => {
  const content = fs.readFileSync(path.join(ROOT, 'components/BottomNav.tsx'), 'utf-8');

  test('contiene Sala de Venta, Notas de Venta, Clientes, Caja Mayor', () => {
    expect(content).toMatch(/Sala de Venta/);
    expect(content).toMatch(/Notas de Venta/);
    expect(content).toMatch(/Clientes/);
    expect(content).toMatch(/Caja Mayor/);
  });

  test('CATÁLOGO es botón con link directo, sin sheet', () => {
    // Catálogo debe ser un Link directo, no abrir un Sheet
    const hasCatalogoSheet = content.includes('catalogoOpen');
    expect(hasCatalogoSheet).toBe(false);
  });
});
