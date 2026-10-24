import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { calcularInversion, fechaHoyChile, type ProductoInversion } from "@/lib/inversion-mercaderia";
import { timingSafeEqual } from "crypto";
import { mensajeError } from '@/lib/errores';

/**
 * POST /api/admin/inversion-mercaderia/snapshot
 * Cron diario (Vercel Cron). Autenticado por
 * Authorization: Bearer $CRON_SECRET — NO usa sesión NextAuth (es un proceso).
 *
 * - fecha = hoy en Chile (America/Santiago), calculada en el servidor.
 * - Idempotente: upsert sobre UNIQUE(empresa_id, fecha); si el cron dispara dos
 *   veces el mismo día no revienta ni duplica.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 });
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  // Comparación en tiempo constante.
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    // Es una sola empresa; resuelve la única fila en vez de asumir id.
    const empresas = (await sql`SELECT id FROM empresas ORDER BY id LIMIT 1`) as { id: number }[];
    const empresaId = empresas[0]?.id;
    if (!empresaId) {
      return NextResponse.json({ error: "No hay empresa registrada" }, { status: 500 });
    }

    const fecha = fechaHoyChile();
    const productos = (await sql`
      SELECT codigo, detalle, saldo, costo, prcventa FROM productos WHERE activo = true
    `) as ProductoInversion[];
    const { resumen, detalle } = calcularInversion(productos);

    const snap = (await sql`
      INSERT INTO snapshots_inversion_mercaderia
        (empresa_id, fecha, costo_total, venta_potencial_total, ganancia_proyectada, productos_sin_costo)
      VALUES (${empresaId}, ${fecha}, ${resumen.costoTotal}, ${resumen.ventaPotencialTotal}, ${resumen.gananciaProyectada}, ${resumen.productosSinCosto})
      ON CONFLICT (empresa_id, fecha) DO UPDATE SET
        costo_total = EXCLUDED.costo_total,
        venta_potencial_total = EXCLUDED.venta_potencial_total,
        ganancia_proyectada = EXCLUDED.ganancia_proyectada,
        productos_sin_costo = EXCLUDED.productos_sin_costo
      RETURNING id
    `) as { id: number }[];
    const snapshotId = snap[0].id;

    // Reemplaza el detalle del día (upsert idempotente ante re-disparo).
    await sql`DELETE FROM snapshots_inversion_mercaderia_detalle WHERE snapshot_id = ${snapshotId}`;

    for (const d of detalle) {
      await sql`
        INSERT INTO snapshots_inversion_mercaderia_detalle
          (snapshot_id, codigo, detalle, saldo, costo, prcventa, costo_total, venta_potencial)
        VALUES (${snapshotId}, ${d.codigo}, ${d.detalle}, ${d.saldo}, ${d.costo}, ${d.prcventa}, ${d.costoTotal}, ${d.ventaPotencial})
      `;
    }

    return NextResponse.json({ fecha, ...resumen });
  } catch (error) {
    const message = mensajeError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
