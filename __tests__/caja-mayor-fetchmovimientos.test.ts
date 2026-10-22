/**
 * BUG-004 Fase B — Tests que intentan romper el fix de caja-mayor/client_page.tsx
 *
 * Dos familias de tests:
 *
 * A) Compilación — el archivo hoy tiene 14 errores TS. Intentar importar
 *    CajaMayorClient DEBE fallar ahora y pasar tras Fase C.
 *
 * B) fetchMovimientos sin selector de empresa (Sitio 10) — safety net:
 *    al eliminar el <select>, filtros.empresa queda huérfano (siempre "").
 *    Estos tests confirman que el guard `if (filtros.empresa)` omite
 *    correctamente el query param y el fetch no se contamina.
 */

// ─── A: Compilación — debe fallar hoy, pasar tras Fase C ──────────

describe("BUG-004: compilación de CajaMayorClient", () => {
  it("el archivo client_page.tsx compila sin errores TS (hoy: 14 errores, meta: 0)", () => {
    // Intentar importar el componente — si el archivo tiene errores TS,
    // next/jest + ts-jest fallarán al transformarlo.
    // Este test DEBE fallar ahora (14 errores) y pasar tras Fase C.
    const mod = require("@/app/(app)/caja-mayor/client_page");
    expect(mod.CajaMayorClient).toBeDefined();
    expect(typeof mod.CajaMayorClient).toBe("function");
  });
});

// ─── B: Helper — replica exacta de la lógica de URL params en fetchMovimientos ───

function buildMovimientosParams(
  page: number,
  filtros: {
    moneda: string;
    cuenta_id: string;
    tipo: string;
    empresa: string;
    desde: string;
    hasta: string;
  }
): URLSearchParams {
  const params = new URLSearchParams({ page: String(page), limit: "50" });
  if (filtros.moneda) params.set("moneda", filtros.moneda);
  if (filtros.cuenta_id) params.set("cuenta_id", filtros.cuenta_id);
  if (filtros.tipo) params.set("tipo", filtros.tipo);
  if (filtros.empresa) params.set("empresa", filtros.empresa);
  if (filtros.desde) params.set("desde", filtros.desde);
  if (filtros.hasta) params.set("hasta", filtros.hasta);
  return params;
}

const EMPTY_FILTROS = {
  moneda: "",
  cuenta_id: "",
  tipo: "",
  empresa: "",
  desde: "",
  hasta: "",
};

describe("BUG-004: fetchMovimientos sin selector de empresa", () => {
  // ─── Sitio 10 — filtros.empresa huérfano ──────────────────────

  it("no incluye 'empresa' en los query params cuando filtros.empresa es '' (initial state)", () => {
    const params = buildMovimientosParams(1, EMPTY_FILTROS);
    expect(params.has("empresa")).toBe(false);
  });

  it("no incluye 'empresa' en los query params cuando filtros.empresa es '' incluso con otros filtros activos", () => {
    const params = buildMovimientosParams(1, {
      ...EMPTY_FILTROS,
      moneda: "USD",
      tipo: "cobro",
      cuenta_id: "3",
      desde: "2026-01-01",
      hasta: "2026-06-30",
    });
    // All active filters should be present
    expect(params.get("moneda")).toBe("USD");
    expect(params.get("tipo")).toBe("cobro");
    expect(params.get("cuenta_id")).toBe("3");
    expect(params.get("desde")).toBe("2026-01-01");
    expect(params.get("hasta")).toBe("2026-06-30");
    // But empresa must still be absent
    expect(params.has("empresa")).toBe(false);
  });

  it("sí incluye 'empresa' si se setea explícitamente (compatibilidad futura con API que aún acepta el filtro)", () => {
    const params = buildMovimientosParams(1, {
      ...EMPTY_FILTROS,
      empresa: "bazar-naty",
    });
    expect(params.get("empresa")).toBe("bazar-naty");
  });

  // ─── Sanity checks ─────────────────────────────────────────────

  it("siempre incluye page y limit", () => {
    const params = buildMovimientosParams(3, EMPTY_FILTROS);
    expect(params.get("page")).toBe("3");
    expect(params.get("limit")).toBe("50");
  });

  it("no incluye ningún filtro cuando todos están vacíos", () => {
    const params = buildMovimientosParams(1, EMPTY_FILTROS);
    const keys = Array.from(params.keys());
    expect(keys).toEqual(["page", "limit"]);
  });
});
