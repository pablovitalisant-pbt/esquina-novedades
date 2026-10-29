/**
 * Fase B — Hotfix "bloquear precio mayor en tienda online".
 * Punto 3: defensa en profundidad en calcularLinea.
 */
jest.mock('@/config/feature-flags.json', () => ({
  'tienda-pago-online': false,
  'tienda-mayor-online': false,
}));

import { calcularLinea, ErrorPrecio } from '@/lib/pedidos/precios';

const PRODUCTO = {
  id: 1,
  codigo: 'P-1',
  detalle: 'Producto 1',
  prcventa: 1500,
  precio_mayor: 12000,
  cantcaja: 6,
  activo: true,
};

const MENSAJE = 'El precio por mayor no está disponible en la tienda online';

describe("calcularLinea — modalidad 'caja' bloqueada en tienda online", () => {
  test('con producto válido igual lanza ErrorPrecio con el mensaje del contrato', () => {
    expect(() => calcularLinea(
      { producto_id: 1, modalidad: 'caja', cantidad: 1 },
      PRODUCTO,
      { origen: 'productos' },
    )).toThrow(ErrorPrecio);
    expect(() => calcularLinea(
      { producto_id: 1, modalidad: 'caja', cantidad: 1 },
      PRODUCTO,
      { origen: 'productos' },
    )).toThrow(MENSAJE);
  });

  test('modalidad unidad sigue calculando prcventa', () => {
    const linea = calcularLinea(
      { producto_id: 1, modalidad: 'unidad', cantidad: 2 },
      PRODUCTO,
      { origen: 'productos' },
    );
    expect(linea.precio).toBe(1500);
    expect(linea.subtotal).toBe(3000);
    expect(linea.unidades).toBe(2);
  });
});
