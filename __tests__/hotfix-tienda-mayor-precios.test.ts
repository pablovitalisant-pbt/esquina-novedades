/**
 * Slice 4b — reemplaza el hotfix "bloquear precio mayor en tienda online".
 * Con el flag `tienda-mayor-online` en false, la modalidad que mande el cliente
 * se ignora y todo se cobra a precio detalle (base).
 */
jest.mock('@/config/feature-flags.json', () => ({
  'tienda-pago-online': false,
  'tienda-mayor-online': false,
}));

import { calcularPedido } from '@/lib/pedidos/precios';

const PRODUCTO = {
  id: 1,
  codigo: 'P-1',
  detalle: 'Producto 1',
  prcventa: 1500,
  precio_mayor: 1200,
  minimo_mayor: 3,
  cantcaja: 6,
  activo: true,
};

const RETIRO = { codigo: 'retiro', costo: 0, requiere_direccion: false, activa: true };

describe('calcularPedido — flag tienda-mayor-online=false', () => {
  test.each(['unidad', 'detalle', 'caja', 'mayor'])(
    "modalidad '%s' se ignora y se cobra precio base",
    (modalidad) => {
      const r = calcularPedido(
        [{ producto_id: 1, modalidad, cantidad: 10 }],
        [PRODUCTO],
        { origen: 'productos', entrega: RETIRO },
      );
      expect(r.lineas[0]).toMatchObject({
        precio: 1500, precio_lista: 1500, modalidad: 'detalle', ahorro: 0,
      });
      expect(r.lineas[0].subtotal).toBe(15000);
      expect(r.descuento).toBe(0);
      expect(r.lineas[0].unidades).toBe(10);
    },
  );
});
