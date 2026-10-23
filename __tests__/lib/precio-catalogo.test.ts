/**
 * Slice A7 — el precio de catálogo es CLP entero: se cobra igual que lo
 * muestra la página y que lo redondea Mercado Pago (sin diferencias de monto).
 */
import { precioCatalogoBase } from '@/lib/precio-catalogo';
import { calcularPedido } from '@/lib/pedidos/precios';

const RETIRO = { codigo: 'retiro', costo: 0, requiere_direccion: false, activa: true };

describe('precioCatalogoBase en CLP entero', () => {
  test('redondea hacia arriba al peso: 1000 con 23.45% → 1235', () => {
    expect(precioCatalogoBase(1000, 23.45)).toBe(1235);
  });

  test('nunca devuelve decimales', () => {
    for (const [costo, margen] of [[99.5, 30], [1590, 15], [2500, 33.3], [700, 0], [1000, 23.45]] as const) {
      const precio = precioCatalogoBase(costo, margen);
      expect(Number.isInteger(precio)).toBe(true);
      expect(precio).toBe(Math.ceil(costo * (1 + margen / 100)));
    }
  });

  test('el pedido de catálogo con ese precio tiene total entero', () => {
    const precio = precioCatalogoBase(1000, 23.45);
    const r = calcularPedido(
      [{ producto_id: 1, modalidad: 'unidad', cantidad: 3 }],
      [{ id: 1, codigo: 'P-1', detalle: 'P', prcventa: 0, precio_mayor: null, cantcaja: null }],
      { origen: 'catalogo', preciosCatalogo: { 1: precio }, entrega: RETIRO },
    );
    expect(r.lineas[0].precio).toBe(1235);
    expect(r.total).toBe(3705);
    expect(Number.isInteger(r.total)).toBe(true);
  });
});
