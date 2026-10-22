import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import type { NotaBusquedaResult } from "@/docs/specs/caja-mayor.spec";

function guard(session: any) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = (session.user as any).rol;
  if (rol !== "admin") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const g = guard(session);
  if (g) return g;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";

  if (q.length < 3) {
    return NextResponse.json({ error: "Mínimo 3 caracteres para buscar" }, { status: 400 });
  }

  try {
    // Zero-pad to 6 digits if input looks like a number
    const isNumeric = /^\d+$/.test(q);
    // ponytail: Slice 13 — repunte movidcto -> prenotas.
    const padded6 = isNumeric ? q.padStart(6, "0") : q;
    const pattern = `%${q}%`;
    const idSearch = isNumeric ? parseInt(q, 10) : null;

    const rows = await sql`
      SELECT
        p.id,
        p.created_at::text AS fecha,
        COALESCE(SUM(pi.subtotal), 0) AS total,
        COALESCE((
          SELECT SUM(cmn.monto_aplicado)
          FROM caja_movimiento_notas cmn
          WHERE cmn.prenota_id = p.id
        ), 0) AS total_pagado,
        p.cliente_id,
        p.nombre_cliente
      FROM public.prenotas p
      LEFT JOIN public.prenota_items pi ON pi.prenota_id = p.id
      WHERE (
        ${idSearch != null ? sql`p.id = ${idSearch}` : sql`FALSE`}
        OR CAST(p.id AS text) = ${q}
        OR CAST(p.id AS text) ILIKE ${pattern}
        OR p.titulo ILIKE ${pattern}
        OR p.nombre_cliente ILIKE ${pattern}
      )
      GROUP BY p.id, p.created_at, p.cliente_id, p.nombre_cliente
      LIMIT 10
    `;

    const results: NotaBusquedaResult[] = rows.map((r: any) => ({
      id: r.id,
      fecha: r.fecha,
      total: parseFloat(r.total),
      total_pagado: parseFloat(r.total_pagado),
      saldo_pendiente: parseFloat(r.total) - parseFloat(r.total_pagado),
      cliente_id: r.cliente_id,
      nombre_cliente: r.nombre_cliente,
      origen: 'bazar-naty',
    }));

    // Sort: pending first, then by date ASC (oldest first)
    results.sort((a, b) => {
      const aPending = a.saldo_pendiente > 0.005 ? 0 : 1;
      const bPending = b.saldo_pendiente > 0.005 ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return a.fecha.localeCompare(b.fecha);
    });

    return NextResponse.json({ data: results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
