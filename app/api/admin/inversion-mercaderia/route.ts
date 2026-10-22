import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { calcularInversion, fechaHoyChile } from "@/lib/inversion-mercaderia";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/admin/inversion-mercaderia?fecha=YYYY-MM-DD&categoria=...
 *
 * - fecha ausente o igual a hoy → cálculo en vivo sobre productos (foto del momento)
 * - fecha pasada → lee el snapshot exacto de snapshots_inversion_mercaderia.
 *   Si no existe (anterior a la activación del slice), responde { sinSnapshot: true } —
 *   la UI muestra "no hay snapshot para esa fecha", nunca inventa un valor.
 * - fecha futura → tratada como hoy (no existe snapshot futuro).
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).rol !== 'admin') {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const fecha = url.searchParams.get('fecha') ?? '';
  const categoria = url.searchParams.get('categoria') ?? '';

  if (fecha && !FECHA_RE.test(fecha)) {
    return NextResponse.json({ error: "Fecha inválida (YYYY-MM-DD)" }, { status: 400 });
  }

  const hoy = fechaHoyChile();
  const esVivo = !fecha || fecha >= hoy; // ausente, hoy o futura

  // El detalle del snapshot NO guarda categoria (decisión Fase A): filtrar una
  // fecha pasada por categoría devolvería datos incompletos. Se rechaza explícito.
  if (!esVivo && categoria) {
    return NextResponse.json(
      { error: "El detalle histórico no se puede filtrar por categoría" },
      { status: 400 }
    );
  }

  try {
    if (esVivo) {
      const productos: any[] = categoria
        ? await sql`SELECT codigo, detalle, saldo, costo, prcventa, imagen_url FROM productos WHERE categoria = ${categoria} AND activo = true`
        : await sql`SELECT codigo, detalle, saldo, costo, prcventa, imagen_url FROM productos WHERE activo = true`;
      const { resumen, detalle } = calcularInversion(productos);
      return NextResponse.json({ resumen, detalle });
    }

    // fecha pasada → snapshot exacto
    const snap: any[] = await sql`
      SELECT id, empresa_id, costo_total, venta_potencial_total, ganancia_proyectada, productos_sin_costo
      FROM snapshots_inversion_mercaderia WHERE fecha = ${fecha}
      ORDER BY id DESC LIMIT 1
    `;
    if (snap.length === 0) {
      return NextResponse.json({ sinSnapshot: true });
    }

    const s = snap[0];
    // La foto se resuelve SIEMPRE contra productos.imagen_url ACTUAL (decisión del
    // Director): a diferencia de costo/precio, no es dato financiero y no debe
    // congelarse en el snapshot. LEFT JOIN → producto borrado cae a placeholder.
    const detalleRows: any[] = await sql`
      SELECT d.codigo, d.detalle, d.saldo, d.costo, d.prcventa, d.costo_total, d.venta_potencial,
             p.imagen_url
      FROM snapshots_inversion_mercaderia_detalle d
      LEFT JOIN productos p ON p.codigo = d.codigo AND p.empresa_id = ${s.empresa_id}
      WHERE d.snapshot_id = ${s.id}
      ORDER BY d.codigo
    `;
    const detalle = detalleRows.map((d) => ({
      codigo: d.codigo,
      detalle: d.detalle,
      saldo: d.saldo,
      costo: d.costo,
      prcventa: d.prcventa,
      costoTotal: Number(d.costo_total),
      ventaPotencial: Number(d.venta_potencial),
      ganancia: Number(d.venta_potencial) - Number(d.costo_total),
      imagen_url: d.imagen_url ?? null,
    }));

    return NextResponse.json({
      resumen: {
        costoTotal: Number(s.costo_total),
        ventaPotencialTotal: Number(s.venta_potencial_total),
        gananciaProyectada: Number(s.ganancia_proyectada),
        productosSinCosto: Number(s.productos_sin_costo),
      },
      detalle,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
