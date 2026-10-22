import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const ReembolsarSchema = z.object({
  observaciones: z.string().nullable().optional(),
});

function validarSesion(session: any) {
  if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  const rol = (session?.user as any)?.rol;
  if (rol === 'bodeguero') {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  }
  return { session, usuarioId: Number((session?.user as any)?.id) };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const auth = validarSesion(session);
  if (auth.error) return auth.error;

  const notaId = parseInt((await params).id, 10);
  if (isNaN(notaId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const parsed = ReembolsarSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { observaciones } = parsed.data;

    // 1. Leer pagos originales (fuera de transacción)
    const pagos = await sql`
      SELECT cmn.monto_aplicado, cmn.movimiento_id,
        cm.cuenta_id, cm.moneda, cm.monto, COALESCE(cm.monto_usd, 0) AS monto_usd, cm.tipo_cambio,
        cm.forma_pago, cm.kcodcli2, cm.nombre_cliente
      FROM caja_movimiento_notas cmn
      JOIN caja_movimientos cm ON cm.id = cmn.movimiento_id
      WHERE cmn.prenota_id = ${notaId}
      ORDER BY cmn.id
    `;
    if (pagos.length === 0) {
      return NextResponse.json(
        { error: "SIN_PAGOS", mensaje: "No hay pagos registrados para reembolsar" },
        { status: 400 }
      );
    }

    const totalPreLeido = pagos.reduce(
      (s: number, p: any) => s + parseFloat(p.monto_aplicado),
      0
    );

    const usuarioId = auth.usuarioId;
    const usuarioNombre = (session!.user as any).nombre as string;

    // 2. Construir array de queries para transacción atómica
    // Guard: 1/COUNT(*) — si COUNT=0 (condiciones no se cumplen) → 1/0 → aborta todo
    const guardQuery = sql`
      SELECT 1 / (SELECT COUNT(*)::int FROM prenotas WHERE id = ${notaId} AND estado = 'activa'
        AND (SELECT COALESCE(SUM(monto_aplicado), 0) FROM caja_movimiento_notas WHERE prenota_id = ${notaId}) = ${totalPreLeido}) AS guard
    `;

    // Un par (INSERT movimiento + INSERT vínculo) por cada pago original
    const pairQueries = pagos.map((p: any) => {
      const montoAplicado = parseFloat(p.monto_aplicado);
      return sql`
        WITH mov AS (
          INSERT INTO caja_movimientos (
            fecha, tipo, kcodcli2, nombre_cliente, cuenta_id,
            moneda, monto, monto_usd, tipo_cambio, forma_pago,
            observaciones, empresa, es_credito, usuario_id, usuario_nombre
          ) VALUES (
            CURRENT_DATE, 'reembolso',
            ${p.kcodcli2}, ${p.nombre_cliente},
            ${p.cuenta_id}, ${p.moneda},
            ${parseFloat(p.monto)}, ${parseFloat(p.monto_usd)},
            ${p.tipo_cambio}, ${p.forma_pago},
            ${observaciones ?? 'Reembolso'}, 'bazar-naty', false,
            ${usuarioId}, ${usuarioNombre}
          )
          RETURNING id, cuenta_id, moneda, monto
        )
        INSERT INTO caja_movimiento_notas (movimiento_id, empresa, prenota_id, monto_aplicado)
        SELECT mov.id, 'bazar-naty', ${notaId}, ${montoAplicado}
        FROM mov
        RETURNING
          (SELECT id FROM mov) AS movimiento_id,
          (SELECT cuenta_id FROM mov) AS cuenta_id,
          (SELECT moneda FROM mov) AS moneda,
          (SELECT monto FROM mov) AS monto
      `;
    });

    // Restaurar stock desde GROUP BY subquery (consistente bajo el lock de fila)
    const stockQueries = [
      sql`UPDATE public.productos p SET saldo = p.saldo + g.total_unidades
        FROM (SELECT codigo, empresa_id, SUM(unidades)::int AS total_unidades
              FROM public.prenota_items WHERE prenota_id = ${notaId} GROUP BY codigo, empresa_id) g
        WHERE p.codigo = g.codigo AND p.empresa_id = g.empresa_id`,
      sql`UPDATE public.ubicaciones_bodega u SET saldo = u.saldo + g.total_unidades, updated_at = NOW()
        FROM (SELECT codigo, empresa_id, SUM(unidades)::int AS total_unidades
              FROM public.prenota_items WHERE prenota_id = ${notaId} GROUP BY codigo, empresa_id) g
        WHERE u.codigo = g.codigo AND u.empresa_id = g.empresa_id`,
    ];

    const updateQuery = sql`
      UPDATE prenotas SET estado = 'anulada' WHERE id = ${notaId}
    `;

    // 3. Ejecutar transacción atómica. El primer query bloquea la fila de
    // prenotas FOR UPDATE (punto 2): serializa con DELETE item concurrente para
    // que el stock se restaure una sola vez.
    const results = await sql.transaction([
      sql`SELECT id FROM public.prenotas WHERE id = ${notaId} FOR UPDATE`,
      guardQuery,
      ...pairQueries,
      ...stockQueries,
      updateQuery,
    ]);

    // 4. Construir respuesta. results = [lock, guard, ...pairs, ...stock, update]
    //    → los pares arrancan en índice 2.
    const pairResults = results.slice(2, 2 + pagos.length);
    const reembolsos = pairResults.map((r: any) => ({
      movimiento_id: r[0].movimiento_id,
      cuenta_id: r[0].cuenta_id,
      moneda: r[0].moneda,
      monto: parseFloat(r[0].monto),
    }));

    return NextResponse.json({
      ok: true,
      estado: "anulada",
      reembolsos,
      total_pagos_reembolsados: totalPreLeido,
    });
  } catch (error: any) {
    // code 22012 = division by zero → guard TOCTOU detectó cambio
    if (String(error.code) === '22012') {
      return NextResponse.json(
        {
          error: "ESTADO_MODIFICADO",
          mensaje: "La nota cambió mientras se procesaba el reembolso, reintentar",
        },
        { status: 409 }
      );
    }
    console.error("POST /api/notas-venta/[id]/reembolsar error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
