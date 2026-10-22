import { notFound } from "next/navigation";
import { PublicCatalogoClient } from "./client_page";
import { sql } from "@/lib/db";
import { filterProducts, type CatalogoProducto } from "@/app/api/catalogos/public/[slug]/filter-products";
import { getLatestIngresoRealCodigos } from "@/utils/catalogo-ingreso";
import { precioCatalogoBase } from "@/lib/precio-catalogo";
import { liberarReservasVencidas } from "@/lib/pedidos/liberar-reservas";

export const dynamic = 'force-dynamic';

// Acepta string CSV o array (Neon puede deserializar text[] automáticamente)
function parseCSVField(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((s: string) => s.trim()).filter(Boolean);
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

export async function getCatalogData(slug: string) {
  try {
    // Slice 8c: liberación perezosa; una falla no puede tumbar el catálogo.
    try {
      await liberarReservasVencidas();
    } catch (error) {
      console.error('liberarReservasVencidas (catalogo):', error);
    }

    const cats = await sql`
      SELECT c.*, e.slug as empresa_slug
      FROM catalogos c
      JOIN empresas e ON c.empresa_id = e.id
      WHERE c.slug = ${slug} AND c.activo = true
    `;
    if (cats.length === 0) return { status: 404, data: null };
    const cat = cats[0];

    const soloNuevo = cat.solo_nuevo;
    const margen = parseFloat(cat.margen_precio) || 0;
    const mostrarPrecio = cat.mostrar_precio;

    const tokens = parseCSVField(cat.palabras_incluir);

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

    const excluir = parseCSVField(cat.palabras_excluir).map((s) => s.toLowerCase());

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
            MAX(p.precio_mayor) as precio_mayor,
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
            MAX(p.precio_mayor) as precio_mayor,
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
    if (soloNuevo) {
      const latestCodigos = await getLatestIngresoRealCodigos(sql, cat.solo_nuevo_top_n ?? 1);
      productos = productos.filter((p: any) => latestCodigos.has(p.codigo.toUpperCase()));
    }

    // Fetch individual price overrides for this catalog
    const overrides = await sql`
      SELECT codigo, precio FROM catalogo_precio_override
      WHERE catalogo_id = ${cat.id}
    `;
    const overridesMap = new Map<string, number>(
      overrides.map((o: any) => [o.codigo.toUpperCase(), parseFloat(o.precio)])
    );

    productos = productos.map((p: any) => {
      const precioBase = mostrarPrecio
        ? precioCatalogoBase(parseFloat(p.costo), margen)
        : null;
      const precioOverride = mostrarPrecio
        ? (overridesMap.get(p.codigo.toUpperCase()) ?? null)
        : null;
      return {
        ...p,
        saldo: parseInt(p.saldo),
        costo: parseFloat(p.costo),
        cantcaja: parseInt(p.cantcaja),
        precio_mayor: p.precio_mayor == null ? null : parseFloat(p.precio_mayor),
        precio_catalogo: precioOverride ?? precioBase,
        precio_override: precioOverride,
      };
    });

    return {
      status: 200,
      data: {
        titulo: cat.titulo,
        descripcion: cat.descripcion,
        mostrar_precio: cat.mostrar_precio,
        mostrar_stock: cat.mostrar_stock,
        empresa_slug: cat.empresa_slug,
        productos,
      }
    };
  } catch (e: any) {
    return { status: 500, data: null };
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const { data } = await getCatalogData(params.slug);
  return { title: `Bazar Naty - ${data?.titulo || 'Catálogo'}` };
}

export default async function PublicCatalogoPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const { status, data } = await getCatalogData(slug);
  if (status === 404) return notFound();
  if (status !== 200 || !data) {
    return <div className="p-8 text-center mt-20 font-bold text-[var(--destructive)]">Error cargando el catálogo.</div>;
  }

  return <PublicCatalogoClient data={data} slug={slug} />;
}
