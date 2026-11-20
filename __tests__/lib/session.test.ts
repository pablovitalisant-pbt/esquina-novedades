/**
 * @jest-environment node
 *
 * Fase B — Limpieza A (#2): `usuarioIdSesion` parsea ESTRICTO el id de sesión.
 * `usuarios.id` es entero NOT NULL: 7 y '7' valen; todo lo demás es null
 * (antes la variante de notas producía NaN, que no es un id válido).
 */

import { usuarioIdSesion } from '@/lib/session';

const conId = (id: unknown) => ({ user: { id } }) as never;

describe('usuarioIdSesion', () => {
  it.each([
    [7, 7],
    ['7', 7],
    ['7a', null],
    ['', null],
    [null, null],
    [undefined, null],
    [7.5, null],
    [-1, null],
  ])('id %p → %p', (id, esperado) => {
    expect(usuarioIdSesion(conId(id))).toBe(esperado);
  });

  it('sin sesión → null', () => {
    expect(usuarioIdSesion(null)).toBeNull();
  });
});
