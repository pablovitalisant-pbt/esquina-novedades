/**
 * Slice 7b — Fase B: precios y totales calculados en el servidor.
 * Pruebas unitarias de lib/pedidos/precios.ts (aún no toca POST /api/pedidos).
 */
jest.mock('@/config/feature-flags.json', () => ({ 'tienda-mayor-online': false }));

import { calcularPedido, ErrorPrecio } from '@/lib/pedidos/precios';
import { precioEnCatalogo } from '@/lib/precio-catalogo';

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

describe('modalidad enviada por el cliente (se ignora)', () => {
  const calcular = (modalidad: string, cant: number, over: Record<string, unknown> = {}) => calcularPedido(
    [{ producto_id: 1, modalidad, cantidad: cant }],
    [producto(over)],
    { origen: 'productos', entrega: RETIRO },
  );

  test("'caja' sin precio_mayor → detalle al precio base", () => {
    const r = calcular('caja', 1, { precio_mayor: null });
    expect(r.lineas[0]).toMatchObject({ precio: 1500, modalidad: 'detalle' });
  });

  test("'caja' con cantcaja=0 no afecta: no existe venta por caja", () => {
    const r = calcular('caja', 1, { cantcaja: 0 });
    expect(r.lineas[0]).toMatchObject({ precio: 1500, modalidad: 'detalle' });
  });

  test('flag tienda-mayor-online=false → cobra detalle aunque cumpla el mínimo', () => {
    const r = calcular('caja', 99, { precio_mayor: 1200, minimo_mayor: 3 });
    expect(r.lineas[0]).toMatchObject({ precio: 1500, modalidad: 'detalle', ahorro: 0 });
  });

  test('modalidad desconocida → ErrorPrecio', () => {
    expect(() => calcular('docena', 1)).toThrow(ErrorPrecio);
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
        { producto_id: 2, modalidad: 'unidad', cantidad: 1 },
      ],
      [
        producto(),
        producto({ id: 2, codigo: 'P-2', prcventa: 5000 }),
      ],
      { origen: 'productos', entrega: DELIVERY, direccion_entrega: 'Calle 1' },
    );
    expect(r.lineas.map((l) => l.subtotal)).toEqual([3000, 5000]);
    expect(r.entrega_costo).toBe(3000);
    expect(r.total).toBe(11000);
  });
});

describe('precio de catálogo (origen catalogo)', () => {
  test('sin override usa el precio de venta del producto, no costo + margen', () => {
    expect(precioEnCatalogo(1500)).toBe(1500);
  });

  test('cobra el precio de catálogo (redondeado a CLP), nunca el del cliente', () => {
    const r = calcularPedido(
      [{ producto_id: 1, modalidad: 'unidad', cantidad: 1, precio: 1 } as any],
      [producto()],
      {
        origen: 'catalogo',
        preciosCatalogo: { 1: precioEnCatalogo(1500, 99.5) },
        entrega: RETIRO,
      },
    );
    expect(r.lineas[0].precio).toBe(100);
    expect(r.total).toBe(100);
  });
});
