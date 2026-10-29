import { precioEnCatalogo } from '@/lib/precio-catalogo';
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { liberarReservasVencidas } from "@/lib/pedidos/liberar-reservas";
import { seleccionarProductosCatalogo } from "./seleccion";
import { mensajeError } from '@/lib/errores';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    // Slice 8c: liberación perezosa; una falla no puede tumbar el catálogo.
    try {
      await liberarReservasVencidas();
    } catch (error) {
      console.error("liberarReservasVencidas (catalogo publico):", error);
    }

    const cats = await sql`
      SELECT c.*, e.slug as empresa_slug
      FROM catalogos c
      JOIN empresas e ON c.empresa_id = e.id
      WHERE c.slug = ${slug} AND c.activo = true
    `;

    if (cats.length === 0) return NextResponse.json({ error: "Catálogo no encontrado" }, { status: 404 });
    const cat = cats[0];

    const mostrarPrecio = cat.mostrar_precio;

    let productos = await seleccionarProductosCatalogo(sql, cat);

    // Fetch individual price overrides for this catalog
    const overrides = (await sql`
      SELECT codigo, precio FROM catalogo_precio_override
      WHERE catalogo_id = ${cat.id}
    `) as { codigo: string; precio: string }[];
    const overridesMap = new Map<string, number>(
      overrides.map((o) => [o.codigo.toUpperCase(), parseFloat(o.precio)])
    );

    // Compute precio_catalogo with override precedence
    productos = productos.map((p) => {
      const precioOverride = mostrarPrecio
        ? (overridesMap.get(p.codigo.toUpperCase()) ?? null)
        : null;
      return {
        ...p,        saldo: parseInt(String(p.saldo)),
        cantcaja: parseInt(String(p.cantcaja)),
        precio_mayor: p.precio_mayor == null ? null : parseFloat(String(p.precio_mayor)),
        minimo_mayor: p.minimo_mayor == null ? null : parseInt(String(p.minimo_mayor)),
        precio_catalogo: mostrarPrecio ? precioEnCatalogo(p.prcventa, precioOverride) : null,
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
  } catch (error) {
    console.error("GET /api/catalogos/public/[slug] error:", error);
    const message = mensajeError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
