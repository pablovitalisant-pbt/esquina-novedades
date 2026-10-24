import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { EMPRESA } from "@/lib/empresa";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import type { NotaConPagos, ResumenClienteResponse } from "@/docs/specs/caja-mayor.spec";
import type { SessionUser } from "../../_types";

function guard(session: Session | null) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = (session.user as SessionUser).rol;
  if (rol !== "admin") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kcodcli2: string }> }
) {
  const session = await getServerSession(authOptions);
  const g = guard(session);
  if (g) return g;

  // kcodcli2 es ahora un UUID (string) desde 13a
  const kcodcli2 = (await params).kcodcli2;

  try {
    const { searchParams } = new URL(_request.url);
    const estado = searchParams.get("estado") || "todas";

    // ponytail: Slice 13 — repunte movidcto -> prenotas.
    // Single query: prenotas + items + pagos via caja_movimiento_notas.
    const rows = await sql`
      SELECT
        p.id,
        p.created_at::text AS fecha,
        COALESCE(SUM(pi.subtotal), 0) AS total,
        cmn.id AS pago_id,
        cmn.monto_aplicado AS pago_monto_aplicado,
        cmn.movimiento_id AS pago_mov_id,
        cmov.fecha::text AS pago_fecha,
        cmov.monto AS pago_monto_original,
        cmov.forma_pago AS pago_forma_pago
      FROM public.prenotas p
      LEFT JOIN public.prenota_items pi ON pi.prenota_id = p.id
      LEFT JOIN caja_movimiento_notas cmn ON cmn.prenota_id = p.id
      LEFT JOIN caja_movimientos cmov ON cmov.id = cmn.movimiento_id
      WHERE p.cliente_id = ${kcodcli2}
      GROUP BY p.id, p.created_at, cmn.id, cmn.monto_aplicado, cmn.movimiento_id,
        cmov.fecha, cmov.monto, cmov.forma_pago
      ORDER BY p.created_at ASC, cmov.fecha ASC
    `;

    // Build notas with pagos
    const notaMap = new Map<number, NotaConPagos>();
    for (const r of rows) {
      if (!notaMap.has(r.id)) {
        notaMap.set(r.id, {
          id: r.id,
          fecha: r.fecha,
          total: parseFloat(r.total),
          total_pagado: 0,
          saldo_pendiente: 0,
          cliente_id: kcodcli2,
          nombre_cliente: null,
          origen: EMPRESA.slug,
          pagos: [],
        });
      }
      const nota = notaMap.get(r.id)!;
      if (r.pago_id) {
        nota.pagos.push({
          movimiento_id: r.pago_mov_id, // UUID (string) desde 11a
          fecha: r.pago_fecha,
          monto_original: parseFloat(r.pago_monto_original),
          monto: Number(r.pago_monto_aplicado),
          forma_pago: r.pago_forma_pago,
        });
        nota.total_pagado += Number(r.pago_monto_aplicado);
      }
      nota.saldo_pendiente = nota.total - nota.total_pagado;
    }

    // Get client name from clientes table (Slice 19 fix)
    const nameRows = await sql`
      SELECT nombre FROM public.clientes WHERE id = ${kcodcli2} LIMIT 1
    `;
    const clientName = nameRows[0]?.nombre || `Cliente #${kcodcli2}`;

    // Build result list
    let notas = Array.from(notaMap.values());

    // Filter by estado
    if (estado === "pendiente") {
      notas = notas.filter((n) => n.saldo_pendiente > 0.005);
    } else if (estado === "pagada") {
      notas = notas.filter((n) => n.saldo_pendiente <= 0.005);
    }

    // Order: pending first, then fecha ASC
    notas.sort((a, b) => {
      const aPending = a.saldo_pendiente > 0.005 ? 0 : 1;
      const bPending = b.saldo_pendiente > 0.005 ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return a.fecha.localeCompare(b.fecha);
    });

    if (notas.length === 0) {
      return NextResponse.json(
        { error: "Cliente no encontrado o sin notas de venta" },
        { status: 404 }
      );
    }

    const totalVendido = notas.reduce((s, n) => s + n.total, 0);
    const totalPagado = notas.reduce((s, n) => s + n.total_pagado, 0);

    const result: ResumenClienteResponse = {
      cliente: { cliente_id: kcodcli2, nombre: clientName },
      notas,
      totales: {
        total_vendido: totalVendido,
        total_pagado: totalPagado,
        total_pendiente: totalVendido - totalPagado,
      },
    };

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
