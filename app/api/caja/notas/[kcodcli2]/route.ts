import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import type { NotaVentaConSaldo } from "@/docs/specs/caja-mayor.spec";

function guard(session: any) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = (session.user as any).rol;
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
    // ponytail: Slice 13 — repunte movidcto -> prenotas.
    // Single-tenant: query directa a prenotas + prenota_items.
    const rows = await sql`
      SELECT
        p.id,
        p.created_at::text AS fecha,
        COALESCE(SUM(pi.unidades * pi.precio), 0) AS total,
        COALESCE((
          SELECT SUM(cmn.monto_aplicado)
          FROM caja_movimiento_notas cmn
          WHERE cmn.prenota_id = p.id
        ), 0) AS total_pagado,
        p.cliente_id,
        p.nombre_cliente
      FROM public.prenotas p
      LEFT JOIN public.prenota_items pi ON pi.prenota_id = p.id
      WHERE p.cliente_id = ${kcodcli2}
      GROUP BY p.id, p.created_at, p.cliente_id, p.nombre_cliente
    `;

    const todas: NotaVentaConSaldo[] = rows.map((r: any) => ({
      id: r.id,
      fecha: r.fecha,
      total: parseFloat(r.total),
      total_pagado: parseFloat(r.total_pagado),
      saldo_pendiente: parseFloat(r.total) - parseFloat(r.total_pagado),
      cliente_id: r.cliente_id,
      nombre_cliente: r.nombre_cliente,
      origen: 'bazar-naty',
    }));

    // Order: pending first (saldo > 0), then by fecha ASC (oldest first)
    todas.sort((a, b) => {
      const aPending = a.saldo_pendiente > 0.005 ? 0 : 1;
      const bPending = b.saldo_pendiente > 0.005 ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return a.fecha.localeCompare(b.fecha);
    });

    if (todas.length === 0) {
      return NextResponse.json({ error: "Cliente no encontrado o sin notas de venta" }, { status: 404 });
    }

    return NextResponse.json({ data: todas });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
