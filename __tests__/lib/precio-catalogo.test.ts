/**
 * Slice 4a — el precio de un producto en un catálogo es el precio de venta
 * (productos.prcventa) o el precio especial del catálogo si existe. Ya NO se
 * usa costo + margen. Siempre CLP entero.
 */
import { precioEnCatalogo } from '@/lib/precio-catalogo';
import { calcularPedido } from '@/lib/pedidos/precios';

const RETIRO = { codigo: 'retiro', costo: 0, requiere_direccion: false, activa: true };

describe('precioEnCatalogo — override gana, si no prcventa', () => {
  test('con override usa el override', () => {
    expect(precioEnCatalogo(1500, 1234)).toBe(1234);
  });

  test('override 0 es válido (precio especial regalado/cero)', () => {
    expect(precioEnCatalogo(1500, 0)).toBe(0);
  });

  test('override inválido (null / NaN / negativo) cae a prcventa', () => {
    expect(precioEnCatalogo(1500, null)).toBe(1500);
    expect(precioEnCatalogo(1500, Number.NaN)).toBe(1500);
    expect(precioEnCatalogo(1500, -1)).toBe(1500);
  });

  test('sin override usa prcventa redondeado a CLP entero', () => {
    expect(precioEnCatalogo(1500)).toBe(1500);
    expect(precioEnCatalogo('999.6')).toBe(1000);
    expect(precioEnCatalogo(1499.4)).toBe(1499);
  });

  test('prcventa null / undefined / 0 sin override → null (no comprable)', () => {
    expect(precioEnCatalogo(null)).toBeNull();
    expect(precioEnCatalogo(undefined)).toBeNull();
    expect(precioEnCatalogo(0)).toBeNull();
    expect(precioEnCatalogo(null, null)).toBeNull();
  });

  test('el pedido de catálogo cobra exactamente ese número', () => {
    const precio = precioEnCatalogo(1500, 1234);
    expect(precio).not.toBeNull();
    const r = calcularPedido(
      [{ producto_id: 1, modalidad: 'unidad', cantidad: 3 }],
      [{ id: 1, codigo: 'P-1', detalle: 'P', prcventa: 1500, precio_mayor: null, cantcaja: null }],
      { origen: 'catalogo', preciosCatalogo: { 1: precio }, entrega: RETIRO },
    );
    expect(r.lineas[0].precio).toBe(1234);
    expect(r.total).toBe(3702);
  });

  test('prcventa null sin override en pedido de catálogo lanza ErrorPrecio', () => {
    const precio = precioEnCatalogo(null);
    expect(() => calcularPedido(
      [{ producto_id: 1, modalidad: 'unidad', cantidad: 1 }],
      [{ id: 1, codigo: 'P-1', detalle: 'P', prcventa: null, precio_mayor: null, cantcaja: null }],
      { origen: 'catalogo', preciosCatalogo: { 1: precio }, entrega: RETIRO },
    )).toThrow('precio de catálogo no disponible para el producto');
  });
});
