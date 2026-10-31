/**
 * Fase B — slice portada-auto: función pura de armado de la portada.
 * Cubre los riesgos mínimos sin render.
 */
import {
  TEXTO_BANNER_FIJO,
  armarPortada,
  ordenRecientes,
} from '@/components/tienda/portada-auto';
import type { ProductoTienda } from '@/lib/tienda-productos';

const p = (over: Partial<ProductoTienda> = {}): ProductoTienda => ({
  codigo: 'X-1',
  id: 1,
  detalle: 'Producto',
  imagen_url: null,
  categoria: null,
  precio: 1000,
  precio_mayor: null,
  minimo_mayor: null,
  saldo: 5,
  es_nuevo: false,
  fecha_ingreso: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('ordenRecientes', () => {
  test('fecha empatada desempata por id DESC', () => {
    const misma = '2026-01-01T00:00:00.000Z';
    const out = ordenRecientes([p({ id: 1, fecha_ingreso: misma }), p({ id: 3, fecha_ingreso: misma }), p({ id: 2, fecha_ingreso: misma })]);
    expect(out.map((x) => x.id)).toEqual([3, 2, 1]);
  });

  test('producto sin fecha_ingreso va al final', () => {
    const out = ordenRecientes([p({ id: 1, fecha_ingreso: null }), p({ id: 2, fecha_ingreso: '2025-01-01T00:00:00.000Z' })]);
    expect(out.map((x) => x.id)).toEqual([2, 1]);
  });

  test('fecha más reciente primero', () => {
    const out = ordenRecientes([
      p({ id: 1, fecha_ingreso: '2025-01-01T00:00:00.000Z' }),
      p({ id: 2, fecha_ingreso: '2026-06-01T00:00:00.000Z' }),
    ]);
    expect(out.map((x) => x.id)).toEqual([2, 1]);
  });
});

describe('armarPortada', () => {
  test('0 categorías: sin secciones y banner con el texto fijo', () => {
    const r = armarPortada([p({ id: 1 }), p({ id: 2 })]);
    expect(r.secciones).toEqual([]);
    expect(r.tituloBanner).toBe(TEXTO_BANNER_FIJO);
    expect(TEXTO_BANNER_FIJO).toContain('más');
  });

  test('categoría sin stock queda oculta; solo aparecen las que tienen stock', () => {
    const r = armarPortada([
      p({ id: 1, categoria: 'Hogar', saldo: 0 }),
      p({ id: 2, categoria: 'Juguetes', saldo: 5 }),
    ]);
    expect(r.secciones.map((s) => s.nombre)).toEqual(['Juguetes']);
  });

  test('producto sin categoría no aparece en ninguna sección', () => {
    const r = armarPortada([p({ id: 1, categoria: 'Hogar' }), p({ id: 2, categoria: null, detalle: 'Suelto' })]);
    const enSecciones = r.secciones.flatMap((s) => s.productos.map((x) => x.id));
    expect(enSecciones).toEqual([1]);
  });

  test('secciones ordenadas por cantidad de productos desc, desempate nombre', () => {
    const r = armarPortada([
      p({ id: 1, categoria: 'Zeta' }),
      p({ id: 2, categoria: 'Alfa' }),
      p({ id: 3, categoria: 'Alfa' }),
      p({ id: 4, categoria: 'Beta' }),
    ]);
    expect(r.secciones.map((s) => s.nombre)).toEqual(['Alfa', 'Beta', 'Zeta']);
    expect(r.tituloBanner).toBe('Alfa, Beta, Zeta y más · Por mayor y por menor');
  });

  test('sección trae como máximo 10 productos, los más recientes', () => {
    const productos = Array.from({ length: 12 }, (_, i) =>
      p({ id: i + 1, categoria: 'Hogar', fecha_ingreso: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }),
    );
    const r = armarPortada(productos);
    expect(r.secciones[0].productos).toHaveLength(10);
    expect(r.secciones[0].productos[0].id).toBe(12);
  });

  test('novedades: 12 con stock, Destacados primero, luego por fecha/id', () => {
    const productos = Array.from({ length: 13 }, (_, i) => p({ id: i + 1 }));
    productos[1] = p({ id: 2, es_nuevo: true });
    const r = armarPortada(productos);
    expect(r.novedades).toHaveLength(12);
    expect(r.novedades[0].id).toBe(2);
    expect(r.novedades[1].id).toBe(13);
    expect(r.novedades.map((x) => x.id)).not.toContain(1);
  });

  test('por mayor: solo con puedeVenderMayor y minimo_mayor entero > 0', () => {
    const r = armarPortada([
      p({ id: 1, precio_mayor: 800, minimo_mayor: 3 }),
      p({ id: 2, precio_mayor: null, minimo_mayor: 3 }),
      p({ id: 3, precio_mayor: 800, minimo_mayor: null }),
      p({ id: 4, precio_mayor: 800, minimo_mayor: 0 }),
    ]);
    expect(r.porMayor.map((x) => x.id)).toEqual([1]);
  });

  test('sin productos por mayor la sección queda vacía (se oculta)', () => {
    const r = armarPortada([p({ id: 1 }), p({ id: 2, es_nuevo: true })]);
    expect(r.porMayor).toEqual([]);
  });

  test('destacados sin fotos: igual son 3', () => {
    const r = armarPortada([p({ id: 1 }), p({ id: 2 }), p({ id: 3 }), p({ id: 4 })]);
    expect(r.destacados.map((x) => x.id)).toEqual([4, 3, 2]);
  });

  test('destacados priorizan los que tienen imagen_url', () => {
    const r = armarPortada([
      p({ id: 1, imagen_url: 'https://cdn/x.jpg' }),
      p({ id: 2 }),
      p({ id: 3 }),
      p({ id: 4 }),
    ]);
    expect(r.destacados.map((x) => x.id)).toEqual([1, 4, 3]);
  });
});
