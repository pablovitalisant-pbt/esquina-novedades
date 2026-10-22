import { filterProducts } from "../app/api/catalogos/public/[slug]/filter-products";

const productos = [
  { codigo: "HS-57",  detalle: "SECA PLATO HS-57 HOLYSTAR TIPO: M ." },
  { codigo: "R.7863", detalle: "PRODUCTO R.7863 GENERICO" },
  { codigo: "HS-5",   detalle: "OTRO PRODUCTO HS-5" },
  { codigo: "ZZ-99",  detalle: "prod holystar x" },
  { codigo: "ANIL",   detalle: "TINTURA ANIL CLASICA" },
];

describe("filterProducts — exclusión", () => {
  test("excluye código con guion (HS-57)", () => {
    const result = filterProducts(productos, [], [], ["hs-57"]);
    const codigos = result.map((p) => p.codigo);
    expect(codigos).not.toContain("HS-57");
  });

  test("excluye código con punto (R.7863)", () => {
    const result = filterProducts(productos, [], [], ["r.7863"]);
    const codigos = result.map((p) => p.codigo);
    expect(codigos).not.toContain("R.7863");
  });

  test("NO excluye código parcial (hs-5 no debe excluir HS-57)", () => {
    const result = filterProducts(productos, [], [], ["hs-5"]);
    const codigos = result.map((p) => p.codigo);
    expect(codigos).toContain("HS-57");
  });

  test("excluye por keyword de texto libre (holystar)", () => {
    const result = filterProducts(productos, [], [], ["holystar"]);
    const codigos = result.map((p) => p.codigo);
    expect(codigos).not.toContain("ZZ-99");
  });

  test("excluye múltiples códigos en una sola llamada", () => {
    const result = filterProducts(productos, [], [], ["hs-57", "anil"]);
    const codigos = result.map((p) => p.codigo);
    expect(codigos).not.toContain("HS-57");
    expect(codigos).not.toContain("ANIL");
  });
});

describe("filterProducts — inclusión no afectada por exclusión de otro", () => {
  test("incluye productos no excluidos", () => {
    const result = filterProducts(productos, [], [], ["hs-57"]);
    const codigos = result.map((p) => p.codigo);
    expect(codigos).toContain("R.7863");
    expect(codigos).toContain("ZZ-99");
  });
});
