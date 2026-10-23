/**
 * Slice 7b — Fase B: precios y totales calculados en el servidor.
 * Pruebas unitarias de lib/pedidos/precios.ts (aún no toca POST /api/pedidos).
 */
import { calcularLinea, calcularPedido, ErrorPrecio } from '@/lib/pedidos/precios';
import { precioCatalogoBase } from '@/lib/precio-catalogo';

const RETIRO = { codigo: 'retiro', costo: 0, requiere_direccion: false, activa: true };
const DELIVERY = { codigo: 'delivery_iquique', costo: 3000, requiere_direccion: true, activa: true };

const producto = (over: Record<string, unknown> = {}) => ({
  id: 1,
  codigo: 'P-1',
  detalle: 'Producto 1',
  prcventa: 1500,
  precio_mayor: 12000,
  cantcaja: 6,
  activo: true,
  costo: 100,
  ...over,
});

describe('precio manipulado por el cliente', () => {
  test('ignora precio, subtotal y total del body y usa los valores de productos', () => {
    const r = calcularPedido(
      [{ producto_id: 1, modalidad: 'unidad', cantidad: 2, precio: 1, subtotal: 1, total: 1, entrega_costo: 999 } as any],
      [producto()],
      { origen: 'productos', entrega: RETIRO, direccion_entrega: null },
    );
    expect(r.lineas[0].precio).toBe(1500);
    expect(r.lineas[0].subtotal).toBe(3000);
    expect(r.entrega_costo).toBe(0);
    expect(r.total).toBe(3000);
  });
});

describe("modalidad 'caja'", () => {
  test('sin precio_mayor → ErrorPrecio', () => {
    expect(() => calcularLinea(
      { producto_id: 1, modalidad: 'caja', cantidad: 1 },
      producto({ precio_mayor: null }),
      { origen: 'productos' },
    )).toThrow(ErrorPrecio);
  });

  test('con cantcaja=0 → ErrorPrecio', () => {
    expect(() => calcularLinea(
      { producto_id: 1, modalidad: 'caja', cantidad: 1 },
      producto({ cantcaja: 0 }),
      { origen: 'productos' },
    )).toThrow(ErrorPrecio);
  });

  test('cobra precio_mayor y descuenta cantidad * cantcaja unidades', () => {
    const linea = calcularLinea(
      { producto_id: 1, modalidad: 'caja', cantidad: 2 },
      producto(),
      { origen: 'productos' },
    );
    expect(linea.precio).toBe(12000);
    expect(linea.subtotal).toBe(24000);
    expect(linea.unidades).toBe(12);
  });
});

describe('entrega', () => {
  test('delivery sin direccion_entrega → ErrorPrecio', () => {
    expect(() => calcularPedido(
      [{ producto_id: 1, modalidad: 'unidad', cantidad: 1 }],
      [producto()],
      { origen: 'productos', entrega: DELIVERY, direccion_entrega: '   ' },
    )).toThrow(ErrorPrecio);
  });

  test('retiro no exige dirección', () => {
    const r = calcularPedido(
      [{ producto_id: 1, modalidad: 'unidad', cantidad: 1 }],
      [producto()],
      { origen: 'productos', entrega: RETIRO, direccion_entrega: '' },
    );
    expect(r.total).toBe(1500);
  });

  test('opción inactiva → ErrorPrecio', () => {
    expect(() => calcularPedido([], [producto()], {
      origen: 'productos',
      entrega: { ...RETIRO, activa: false },
    })).toThrow(ErrorPrecio);
  });
});

describe('total', () => {
  test('total = suma de subtotales + costo de entrega', () => {
    const r = calcularPedido(
      [
        { producto_id: 1, modalidad: 'unidad', cantidad: 2 },
        { producto_id: 2, modalidad: 'caja', cantidad: 1 },
      ],
      [
        producto(),
        producto({ id: 2, codigo: 'P-2', precio_mayor: 5000, cantcaja: 6 }),
      ],
      { origen: 'productos', entrega: DELIVERY, direccion_entrega: 'Calle 1' },
    );
    expect(r.lineas.map((l) => l.subtotal)).toEqual([3000, 5000]);
    expect(r.entrega_costo).toBe(3000);
    expect(r.total).toBe(11000);
  });
});

describe('precio de catálogo (origen catalogo)', () => {
  test('usa la misma fórmula que la página del catálogo', () => {
    expect(precioCatalogoBase(99.5, 30)).toBe(129.4);
  });

  test('cobra el precio de catálogo (redondeado a CLP), nunca el del cliente', () => {
    const r = calcularPedido(
      [{ producto_id: 1, modalidad: 'unidad', cantidad: 1, precio: 1 } as any],
      [producto()],
      {
        origen: 'catalogo',
        preciosCatalogo: { 1: precioCatalogoBase(99.5, 30) },
        entrega: RETIRO,
      },
    );
    expect(r.lineas[0].precio).toBe(129);
    expect(r.total).toBe(129);
  });
});
