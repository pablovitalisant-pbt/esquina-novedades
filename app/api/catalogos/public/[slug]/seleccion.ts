import { sql as sqlType } from '@/lib/db';
import { filterProducts } from './filter-products';
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

type ProductoCatalogoFila = {
  id: number;
  codigo: string;
  detalle: string | null;
  imagen_url: string | null;
  cantcaja: string | number;
  umed: string;
  costo: string | number;
  prcventa: string | number | null;
  saldo: string | number;
  es_nuevo: boolean;
};

type CatalogoSeleccion = {
  empresa_id?: number;
  palabras_incluir?: string | null;
  palabras_excluir?: string | null;
  categoria?: string | null;
  solo_stock?: boolean;
  solo_nuevo?: boolean;
  solo_nuevo_top_n?: number | null;
};

export async function seleccionarProductosCatalogo(
  sql: typeof sqlType,
  cat: CatalogoSeleccion,
): Promise<ProductoCatalogoFila[]> {
  const tokens = parseKeywords(cat.palabras_incluir ?? '');

  let codigosIncluir: string[] = [];
  let keywordsIncluir: string[] = [];

  if (tokens.length > 0) {
    const tokensUpper = tokens.map((t: string) => t.toUpperCase());
    const found = (await sql`
      SELECT DISTINCT UPPER(codigo) as codigo
      FROM productos
      WHERE UPPER(codigo) = ANY(${tokensUpper})
    `) as { codigo: string }[];
    const codigosEncontrados = new Set(found.map((r) => r.codigo));
    codigosIncluir = tokensUpper.filter((t: string) => codigosEncontrados.has(t));
    keywordsIncluir = tokens
      .filter((t: string) => !codigosEncontrados.has(t.toUpperCase()))
      .map((t: string) => t.toLowerCase());
  }

  const excluir = parseKeywords(cat.palabras_excluir ?? '').map((s: string) => s.toLowerCase());
  const categoriaFilter = cat.categoria;

  const rows = (categoriaFilter
    ? await sql`
        SELECT
          p.codigo,
          MAX(p.id) as id,
          MAX(p.detalle) as detalle,
          MAX(p.imagen_url) as imagen_url,
          MAX(p.cantcaja) as cantcaja,
          MAX(p.umed) as umed,
          MAX(p.costo) as costo,
          MAX(p.prcventa) as prcventa,
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
          MAX(p.prcventa) as prcventa,
          SUM(p.saldo) as saldo,
          BOOL_OR(p.es_nuevo) as es_nuevo
        FROM productos p
        WHERE p.empresa_id = ${cat.empresa_id}
          AND p.activo = true
        GROUP BY p.codigo
        ORDER BY p.codigo ASC
      `) as ProductoCatalogoFila[];

  let productos = filterProducts(rows, codigosIncluir, keywordsIncluir, excluir) as ProductoCatalogoFila[];

  if (cat.solo_stock) {
    productos = productos.filter((p) => Number(p.saldo) > 0);
  }
  if (cat.solo_nuevo) {
    const latestCodigos = await getLatestIngresoRealCodigos(sql, cat.solo_nuevo_top_n ?? 1);
    productos = productos.filter((p) => latestCodigos.has(p.codigo.toUpperCase()));
  }

  return productos;
}
