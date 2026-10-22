/** @jest-environment node */

import { filterProducts } from "../app/api/catalogos/public/[slug]/filter-products";

describe("filterProducts palabras_incluir", () => {
  test("Producto incluido por codigo exacto", () => {
    const productos = [
      { codigo: "SF-2074", detalle: "HERVIDOR DE AGUA" },
    ];

    const codigosIncluir = ["SF-2074"];
    const keywordsIncluir = ["licuadora"];
    const keywordsExcluir: string[] = [];

    const result = filterProducts(productos, codigosIncluir, keywordsIncluir, keywordsExcluir);

    expect(result.map((p) => p.codigo)).toEqual(["SF-2074"]);
  });

  test("Producto incluido por keyword en descripcion", () => {
    const productos = [
      { codigo: "ABC999", detalle: "LICUADORA INDUSTRIAL" },
    ];

    const codigosIncluir = ["SF-2074"];
    const keywordsIncluir = ["licuadora"];
    const keywordsExcluir: string[] = [];

    const result = filterProducts(productos, codigosIncluir, keywordsIncluir, keywordsExcluir);

    expect(result.map((p) => p.codigo)).toEqual(["ABC999"]);
  });

  test("Producto excluido cuando no coincide ni codigo ni keyword", () => {
    const productos = [
      { codigo: "XYZ111", detalle: "HERVIDOR DE AGUA" },
    ];

    const codigosIncluir = ["SF-2074"];
    const keywordsIncluir = ["licuadora"];
    const keywordsExcluir: string[] = [];

    const result = filterProducts(productos, codigosIncluir, keywordsIncluir, keywordsExcluir);

    expect(result).toHaveLength(0);
  });

  test("Sin duplicados cuando codigo y keyword coinciden", () => {
    const productos = [
      { codigo: "SF-2074", detalle: "HERVIDOR DE AGUA" },
    ];

    const codigosIncluir = ["SF-2074"];
    const keywordsIncluir = ["hervidor"];
    const keywordsExcluir: string[] = [];

    const result = filterProducts(productos, codigosIncluir, keywordsIncluir, keywordsExcluir);

    expect(result.map((p) => p.codigo)).toEqual(["SF-2074"]);
  });
});
