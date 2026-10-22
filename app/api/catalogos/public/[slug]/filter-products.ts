export type CatalogoProducto = {
  codigo: string;
  detalle?: string | null;
  precio_override?: number | null;
};

export function filterBySoloNuevo(
  productos: CatalogoProducto[],
  latestCodigos: Set<string>
): CatalogoProducto[] {
  return productos.filter((p) => latestCodigos.has(p.codigo.toUpperCase()));
}

export function filterProducts(
  productos: CatalogoProducto[],
  codigosIncluir: string[],
  keywordsIncluir: string[],
  keywordsExcluir: string[]
) {
  const incluir = keywordsIncluir.filter(Boolean);
  const excluirUpper = keywordsExcluir.map((k) => k.trim().toUpperCase()).filter(Boolean);

  return productos.filter((p) => {
    const codigoUpper = p.codigo.trim().toUpperCase();
    const haystack = `${p.codigo} ${p.detalle ?? ""}`.toLowerCase();

    if (codigosIncluir.length > 0 || incluir.length > 0) {
      const matchesCodigo = codigosIncluir.includes(codigoUpper);
      const matchesKeyword = incluir.some((kw) => {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(?<![a-záéíóúñ])${escaped}(?![a-záéíóúñ])`, "i").test(haystack);
      });
      if (!matchesCodigo && !matchesKeyword) return false;
    }

    if (excluirUpper.length > 0) {
      // Comparación directa de código (cubre guiones, puntos, exactitud total)
      if (excluirUpper.includes(codigoUpper)) return false;
      // Keyword de texto libre: regex solo para términos sin guion ni punto
      const matchesKeyword = excluirUpper.some((kw) => {
        if (/[-.]/.test(kw)) return false; // skip: ya cubierto por comparación directa
        const escaped = kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(?<![a-z0-9áéíóúñ])${escaped}(?![a-z0-9áéíóúñ])`, "i").test(haystack);
      });
      if (matchesKeyword) return false;
    }

    return true;
  });
}
