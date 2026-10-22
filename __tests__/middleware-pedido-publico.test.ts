/**
 * @jest-environment node
 *
 * Fase B — Slice 9d: el matcher real de middleware.ts deja /pedido/<uuid>
 * público sin abrir /pedidos (staff).
 */
import { config } from '@/middleware';

const matcher = new RegExp(`^${config.matcher[0]}$`);
const exigeSesion = (pathname: string) => matcher.test(pathname);

describe('middleware — /pedido público', () => {
  test('/pedido/<uuid> NO exige sesión', () => {
    expect(exigeSesion('/pedido/6c1f0a2e-8b3d-4a5f-9c7e-1d2b3a4c5d6e')).toBe(false);
  });

  test('/pedidos y /pedidos/<id> siguen exigiendo sesión', () => {
    expect(exigeSesion('/pedidos')).toBe(true);
    expect(exigeSesion('/pedidos/abc')).toBe(true);
  });

  test('el resto de rutas staff sigue protegido', () => {
    expect(exigeSesion('/admin')).toBe(true);
    expect(exigeSesion('/caja-mayor')).toBe(true);
  });
});
