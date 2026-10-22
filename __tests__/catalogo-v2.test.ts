import {
  CatalogoCreateSchema,
  CatalogoProductoPublicoSchema,
  CatalogoPublicoSchema,
} from "../docs/specs/catalogo-v2.spec";

describe("CatalogoCreateSchema", () => {
  test("válido mínimo aplica defaults", () => {
    const input = { empresaId: 1, titulo: "Catálogo Mayo" };
    const result = CatalogoCreateSchema.parse(input);
    expect(result).toEqual({
      empresaId: 1,
      titulo: "Catálogo Mayo",
      descripcion: undefined,
      mostrar_precio: true,
      margen_precio: 0,
      solo_stock: false,
      solo_nuevo: false,
      palabras_incluir: "",
      palabras_excluir: "",
    });
  });

  test("válido con todos los campos", () => {
    const input = {
      empresaId: 1,
      titulo: "Test",
      mostrar_precio: false,
      margen_precio: 30,
      solo_stock: true,
      solo_nuevo: true,
      palabras_incluir: "vidrio,licuadora",
      palabras_excluir: "NAVIDAD,ANIL",
    };
    const result = CatalogoCreateSchema.parse(input);
    expect(result).toEqual({
      ...input,
      descripcion: undefined,
    });
  });

  test("sin titulo falla", () => {
    const input = { empresaId: 1, titulo: "" };
    const result = CatalogoCreateSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("margen_precio > 500 falla", () => {
    const input = { empresaId: 1, titulo: "Test", margen_precio: 501 };
    const result = CatalogoCreateSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("sin empresaId falla", () => {
    const input = {};
    const result = CatalogoCreateSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("CatalogoProductoPublicoSchema", () => {
  const baseProducto = {
    id: 10,
    codigo: "SKU-1",
    detalle: null,
    imagen_url: null,
    cantcaja: 1,
    umed: "UND",
    costo: 1000,
    es_nuevo: false,
    saldo: 5,
  };

  test("válido con precio", () => {
    const input = { ...baseProducto, precio_catalogo: 1200 };
    const result = CatalogoProductoPublicoSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("válido con precio null", () => {
    const input = { ...baseProducto, precio_catalogo: null };
    const result = CatalogoProductoPublicoSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe("CatalogoPublicoSchema", () => {
  test("válido con productos vacíos", () => {
    const input = {
      titulo: "Catálogo Mayo",
      descripcion: null,
      mostrar_precio: true,
      empresa_slug: "mi-empresa",
      productos: [],
    };
    const result = CatalogoPublicoSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe("Reglas auxiliares", () => {
  test("cálculo de precio", () => {
    const costo = 100;
    const margen_precio = 30;
    const precio = costo * (1 + margen_precio / 100);
    expect(precio).toBe(130);
  });

  test("palabras clave split", () => {
    const palabras_excluir = "NAVIDAD,ANIL";
    const partes = palabras_excluir.split(",").map((s) => s.trim());
    expect(partes).toEqual(["NAVIDAD", "ANIL"]);
  });
});
