/**
 * Fase B — Punto 6: errores TS de producción (13 fixes mecánicos).
 * Tests que fuerzan la condición antes del fix (rojo).
 * Patrón source-scan (mismo que subslice-b-badges.test.ts) — sin jsdom.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('P6 — cluster categorias: id como string (UUID, migración 029)', () => {
  const f = 'app/(app)/admin/categorias/client_page.tsx';

  test('onDelete prop recibe id string', () => {
    const c = fs.readFileSync(path.join(ROOT, f), 'utf-8');
    expect(c).toMatch(/onDelete: \(id: string, total_productos: number\)/);
    expect(c).not.toMatch(/onDelete: \(id: number/);
  });

  test('handleEliminarCategoria recibe id string', () => {
    const c = fs.readFileSync(path.join(ROOT, f), 'utf-8');
    expect(c).toMatch(/handleEliminarCategoria = async \(id: string, total_productos: number\)/);
    expect(c).not.toMatch(/handleEliminarCategoria = async \(id: number/);
  });

  test('cast del droppable usa categoriaId string', () => {
    const c = fs.readFileSync(path.join(ROOT, f), 'utf-8');
    expect(c).toMatch(/as \{ categoriaId: string; nombre: string \}/);
    expect(c).not.toMatch(/categoriaId: number/);
  });
});

describe('P6 — Badge: variante secondary (union type)', () => {
  const f = 'components/ui/badge.tsx';

  test('badgeVariants incluye secondary con token secondary', () => {
    const c = fs.readFileSync(path.join(ROOT, f), 'utf-8');
    expect(c).toMatch(/secondary:\s*"bg-secondary text-secondary-foreground/);
  });
});

describe('P6 — notas-venta/[id]: sin atributo JSX duplicado', () => {
  const f = 'app/(app)/notas-venta/[id]/client_page.tsx';

  test('ninguna etiqueta JSX repite el atributo size', () => {
    const c = fs.readFileSync(path.join(ROOT, f), 'utf-8');
    expect(c).not.toMatch(/size="sm"\s+[^>]*size="sm"/);
  });
});
