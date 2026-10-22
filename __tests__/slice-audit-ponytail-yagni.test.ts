/**
 * Fase B — Slice 2 del audit ponytail: stdlib + yagni.
 * Fuerza la condición ANTES del corte (rojo) y guarda contra sobre-recorte.
 * Patrón source-scan (sin jsdom).
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('Slice 2 — uploadImage usa Promise nativa (stdlib)', () => {
  const c = () => read('lib/cloudinary.ts');

  test('NO tiene wrapper manual new Promise (callback de Cloudinary)', () => {
    expect(c()).not.toContain('new Promise');
  });

  test('devuelve cloudinary.uploader.upload directo (Promise nativa)', () => {
    expect(c()).toMatch(/return cloudinary\.uploader\.upload\(/);
  });

  test('guard: conserva la config de cloudinary a nivel módulo', () => {
    expect(c()).toContain('cloudinary.config');
  });
});

describe('Slice 2 — getLatestIngresoRealCodigos sin param empresaId (yagni)', () => {
  const util = () => read('utils/catalogo-ingreso.ts');

  test('la firma ya no declara empresaId ni lo hace void', () => {
    const src = util();
    expect(src).not.toMatch(/empresaId/);
    expect(src).not.toMatch(/void empresaId/);
  });

  test('guard: conserva los params sql y topN', () => {
    expect(util()).toMatch(/getLatestIngresoRealCodigos\(\s*sql/);
    expect(util()).toMatch(/topN: number = 1/);
  });

  describe('los 3 callers ya no pasan empresaId', () => {
    test('app/api/catalogos/public/[slug]/route.ts', () => {
      expect(read('app/api/catalogos/public/[slug]/route.ts')).not.toMatch(/getLatestIngresoRealCodigos\(sql, cat\.empresa_id/);
    });
    test('app/catalogo/[slug]/page.tsx', () => {
      expect(read('app/catalogo/[slug]/page.tsx')).not.toMatch(/getLatestIngresoRealCodigos\(sql, cat\.empresa_id/);
    });
    test('app/page.tsx', () => {
      expect(read('app/page.tsx')).not.toMatch(/getLatestIngresoRealCodigos\(sql, 1, 1/);
    });
  });
});
