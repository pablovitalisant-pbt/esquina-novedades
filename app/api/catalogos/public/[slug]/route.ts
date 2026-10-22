import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { seleccionarProductosCatalogo } from "./seleccion";

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const cats = await sql`
      SELECT c.*, e.slug as empresa_slug
      FROM catalogos c
      JOIN empresas e ON c.empresa_id = e.id
      WHERE c.slug = ${slug} AND c.activo = true
    `;

    if (cats.length === 0) return NextResponse.json({ error: "Catálogo no encontrado" }, { status: 404 });
    const cat = cats[0];

    const margen = parseFloat(cat.margen_precio) || 0;
    const mostrarPrecio = cat.mostrar_precio;

    let productos = await seleccionarProductosCatalogo(sql, cat);

    // Fetch individual price overrides for this catalog
    const overrides = await sql`
      SELECT codigo, precio FROM catalogo_precio_override
      WHERE catalogo_id = ${cat.id}
    `;
    const overridesMap = new Map<string, number>(
      overrides.map((o: any) => [o.codigo.toUpperCase(), parseFloat(o.precio)])
    );

    // Compute precio_catalogo with override precedence
    productos = productos.map((p: any) => {
      const precioBase = mostrarPrecio
        ? Math.ceil(parseFloat(p.costo) * (1 + margen / 100) * 10) / 10
        : null;
      const precioOverride = mostrarPrecio
        ? (overridesMap.get(p.codigo.toUpperCase()) ?? null)
        : null;
      return {
        ...p,
        saldo: parseInt(p.saldo),
        costo: parseFloat(p.costo),
        cantcaja: parseInt(p.cantcaja),
        precio_catalogo: precioOverride ?? precioBase,
        precio_override: precioOverride,
      };
    });

    return NextResponse.json({
      data: {
        titulo: cat.titulo,
        descripcion: cat.descripcion,
        mostrar_precio: cat.mostrar_precio,
        mostrar_stock: cat.mostrar_stock,
        empresa_slug: cat.empresa_slug,
        productos,
      }
    });
  } catch (error: any) {
    console.error("GET /api/catalogos/public/[slug] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
