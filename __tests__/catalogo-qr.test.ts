import { QRCatalogoSchema } from "../docs/specs/catalogo-qr.spec";

describe("QRCatalogoSchema", () => {
  test("válido", () => {
    const input = {
      slug: "ofertas-mayo-12345",
      baseUrl: "https://bazar-naty.vercel.app",
      publicUrl: "https://bazar-naty.vercel.app/catalogo/ofertas-mayo-12345",
    };
    const result = QRCatalogoSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("sin slug falla", () => {
    const input = {
      slug: "",
      baseUrl: "https://example.com",
      publicUrl: "https://example.com/catalogo/test",
    };
    const result = QRCatalogoSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("baseUrl inválida falla", () => {
    const input = {
      slug: "test",
      baseUrl: "no-es-url",
      publicUrl: "https://example.com/catalogo/test",
    };
    const result = QRCatalogoSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("construcción de publicUrl", () => {
    const slug = "test-123";
    const baseUrl = "https://example.com";
    const publicUrl = `${baseUrl}/catalogo/${slug}`;
    expect(publicUrl).toBe("https://example.com/catalogo/test-123");
  });

  test("publicUrl inválida falla", () => {
    const input = {
      slug: "test",
      baseUrl: "https://example.com",
      publicUrl: "no-es-url",
    };
    const result = QRCatalogoSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
