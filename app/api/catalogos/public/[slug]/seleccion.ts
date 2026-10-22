import { sql as sqlType } from '@/lib/db';
import { filterProducts, type CatalogoProducto } from './filter-products';
import { getLatestIngresoRealCodigos } from '@/utils/catalogo-ingreso';

/**
 * Selección de productos de un catálogo. Única fuente de verdad: la usan el
 * catálogo público (GET) y la validación de pedidos con origen='catalogo',
 * para que un catálogo no pueda venderse con productos que no muestra.
 */
export function parseKeywords(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  return raw.split(',').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

export async function seleccionarProductosCatalogo(
  sql: typeof sqlType,
  cat: Record<string, any>,
): Promise<any[]> {
  const tokens = parseKeywords(cat.palabras_incluir ?? '');

  let codigosIncluir: string[] = [];
  let keywordsIncluir: string[] = [];

  if (tokens.length > 0) {
    const tokensUpper = tokens.map((t: string) => t.toUpperCase());
    const found = await sql`
      SELECT DISTINCT UPPER(codigo) as codigo
      FROM productos
      WHERE UPPER(codigo) = ANY(${tokensUpper})
    `;
    const codigosEncontrados = new Set(found.map((r: any) => r.codigo));
    codigosIncluir = tokensUpper.filter((t: string) => codigosEncontrados.has(t));
    keywordsIncluir = tokens
      .filter((t: string) => !codigosEncontrados.has(t.toUpperCase()))
      .map((t: string) => t.toLowerCase());
  }

  const excluir = parseKeywords(cat.palabras_excluir ?? '').map((s: string) => s.toLowerCase());
  const categoriaFilter = cat.categoria;

  const rows = categoriaFilter
    ? await sql`
        SELECT
          p.codigo,
          MAX(p.id) as id,
          MAX(p.detalle) as detalle,
          MAX(p.imagen_url) as imagen_url,
          MAX(p.cantcaja) as cantcaja,
          MAX(p.umed) as umed,
          MAX(p.costo) as costo,
          SUM(p.saldo) as saldo,
          BOOL_OR(p.es_nuevo) as es_nuevo
        FROM productos p
        WHERE p.empresa_id = ${cat.empresa_id}
          AND p.categoria = ${categoriaFilter}
          AND p.activo = true
        GROUP BY p.codigo
        ORDER BY p.codigo ASC
      `
    : await sql`
        SELECT
          p.codigo,
          MAX(p.id) as id,
          MAX(p.detalle) as detalle,
          MAX(p.imagen_url) as imagen_url,
          MAX(p.cantcaja) as cantcaja,
          MAX(p.umed) as umed,
          MAX(p.costo) as costo,
          SUM(p.saldo) as saldo,
          BOOL_OR(p.es_nuevo) as es_nuevo
        FROM productos p
        WHERE p.empresa_id = ${cat.empresa_id}
          AND p.activo = true
        GROUP BY p.codigo
        ORDER BY p.codigo ASC
      `;

  let productos = filterProducts(rows as CatalogoProducto[], codigosIncluir, keywordsIncluir, excluir);

  if (cat.solo_stock) {
    productos = productos.filter((p: any) => Number(p.saldo) > 0);
  }
  if (cat.solo_nuevo) {
    const latestCodigos = await getLatestIngresoRealCodigos(sql, cat.solo_nuevo_top_n ?? 1);
    productos = productos.filter((p: any) => latestCodigos.has(p.codigo.toUpperCase()));
  }

  return productos;
}
