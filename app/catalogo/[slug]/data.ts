import { sql } from "@/lib/db";
import { seleccionarProductosCatalogo } from "@/app/api/catalogos/public/[slug]/seleccion";
import { precioEnCatalogo } from "@/lib/precio-catalogo";
import { liberarReservasVencidas } from "@/lib/pedidos/liberar-reservas";

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

    const mostrarPrecio = cat.mostrar_precio;

    const rows = await seleccionarProductosCatalogo(sql, cat);

    // Fetch individual price overrides for this catalog
    const overrides = await sql`
      SELECT codigo, precio FROM catalogo_precio_override
      WHERE catalogo_id = ${cat.id}
    `;
    const overridesMap = new Map<string, number>(
      (overrides as Array<{ codigo: string; precio: string }>).map((o): [string, number] => [o.codigo.toUpperCase(), parseFloat(o.precio)])
    );

    const productos = rows.map((p) => {
      const precioOverride = mostrarPrecio
        ? (overridesMap.get(p.codigo.toUpperCase()) ?? null)
        : null;
      return {
        ...p,
        saldo: parseInt(String(p.saldo)),
        prcventa: p.prcventa == null ? null : parseFloat(String(p.prcventa)),
        cantcaja: parseInt(String(p.cantcaja)),
        precio_mayor: p.precio_mayor == null ? null : parseFloat(String(p.precio_mayor)),
        minimo_mayor: p.minimo_mayor == null ? null : parseInt(String(p.minimo_mayor)),
        precio_catalogo: mostrarPrecio ? precioEnCatalogo(p.prcventa, precioOverride) : null,
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
  } catch {
    return { status: 500, data: null };
  }
}
