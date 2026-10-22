import { CatalogoUpdateSchema } from "../docs/specs/catalogo-margen.spec";

describe("CatalogoUpdateSchema — margen_precio", () => {
  test("acepta margen_precio válido", () => {
    const result = CatalogoUpdateSchema.safeParse({ margen_precio: 25.5 });
    expect(result.success).toBe(true);
  });

  test("acepta margen_precio = 0", () => {
    const result = CatalogoUpdateSchema.safeParse({ margen_precio: 0 });
    expect(result.success).toBe(true);
  });

  test("rechaza margen_precio negativo", () => {
    const result = CatalogoUpdateSchema.safeParse({ margen_precio: -1 });
    expect(result.success).toBe(false);
  });

  test("rechaza margen_precio > 999.99", () => {
    const result = CatalogoUpdateSchema.safeParse({ margen_precio: 1000 });
    expect(result.success).toBe(false);
  });

  test("campo margen_precio es opcional", () => {
    const result = CatalogoUpdateSchema.safeParse({ titulo: "Catálogo test" });
    expect(result.success).toBe(true);
  });
});

describe("precio_catalogo — recálculo display-time", () => {
  function calcPrecio(costo: number, margen: number): number {
    return Math.ceil(costo * (1 + margen / 100) * 10) / 10;
  }

  test("margen 25% sobre costo 100 → 125", () => {
    expect(calcPrecio(100, 25)).toBe(125);
  });

  test("margen 0% no modifica el costo", () => {
    expect(calcPrecio(100, 0)).toBe(100);
  });

  test("margen 30% sobre costo 99.5 → 129.4", () => {
    expect(calcPrecio(99.5, 30)).toBe(129.4);
  });
});
