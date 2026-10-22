/** @jest-environment node */

import { filterBySoloNuevo } from '../app/api/catalogos/public/[slug]/filter-products';

describe('filterBySoloNuevo', () => {
  test('retiene solo productos cuyo codigo está en latestCodigos', () => {
    const latestCodigos = new Set(['SKU-A', 'SKU-B']);
    const productos = [
      { codigo: 'SKU-A', detalle: 'Producto A' },
      { codigo: 'SKU-B', detalle: 'Producto B' },
      { codigo: 'SKU-C', detalle: 'Producto anterior' },
    ];
    const result = filterBySoloNuevo(productos, latestCodigos);
    expect(result.map((p) => p.codigo)).toEqual(['SKU-A', 'SKU-B']);
  });

  test('retorna vacío cuando latestCodigos está vacío', () => {
    const latestCodigos = new Set<string>();
    const productos = [{ codigo: 'SKU-X', detalle: 'Producto X' }];
    const result = filterBySoloNuevo(productos, latestCodigos);
    expect(result).toHaveLength(0);
  });

  test('excluye producto con es_nuevo=true si no está en el ingreso más reciente', () => {
    // Documenta el fix: el flag es_nuevo=true (top-3) no es suficiente;
    // solo pasan los del ingreso #1 más reciente.
    const latestCodigos = new Set(['NUEVO-SKU']);
    const productos = [
      { codigo: 'VIEJO-SKU', detalle: 'Del 2do ingreso, tiene es_nuevo=true' },
      { codigo: 'NUEVO-SKU', detalle: 'Del ingreso más reciente' },
    ];
    const result = filterBySoloNuevo(productos, latestCodigos);
    expect(result).toHaveLength(1);
    expect(result[0].codigo).toBe('NUEVO-SKU');
  });
});
