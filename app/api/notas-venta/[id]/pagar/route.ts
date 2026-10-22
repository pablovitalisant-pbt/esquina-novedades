import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { EMPRESA } from "@/lib/empresa";
import { NextResponse } from "next/server";
import { z } from "zod";

const PagarNotaSchema = z.object({
  cuenta_id: z.coerce.number().int().positive(),
  monto: z.coerce.number().int("El monto debe ser entero").positive("El monto debe ser mayor a 0"),
  forma_pago: z.enum(["efectivo", "cheque", "transferencia"]),
  observaciones: z.string().nullable().optional(),
});

function guard(session: any) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = (session.user as any).rol;
  if (rol !== "admin" && rol !== "vendedor") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const g = guard(session);
  if (g) return g;

  const notaId = parseInt((await params).id, 10);
  if (isNaN(notaId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const parsed = PagarNotaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { cuenta_id, monto, forma_pago, observaciones } = parsed.data;

    // 1. Fetch nota (sin filtro de usuario_id — admin/vendedor puede pagar cualquier nota)
    const notaRows = await sql`
      SELECT p.id, p.estado, p.cliente_id, p.nombre_cliente
      FROM public.prenotas p
      WHERE p.id = ${notaId}
    `;
    if (notaRows.length === 0) {
      return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
    }
    const nota = notaRows[0];
    if (nota.estado !== 'activa') {
      return NextResponse.json(
        { error: "No se puede pagar una nota anulada" },
        { status: 422 }
      );
    }

    // 2. Calcular total, total_pagado y saldo_pendiente
    const totalRows = await sql`
      SELECT COALESCE(SUM(pi.subtotal), 0) AS total
      FROM public.prenota_items pi
      WHERE pi.prenota_id = ${notaId}
    `;
    const total = parseFloat(totalRows[0].total);

    if (total <= 0) {
      return NextResponse.json(
        { error: "La nota no tiene productos o su total es cero" },
        { status: 422 }
      );
    }

    const pagadoRows = await sql`
      SELECT COALESCE(SUM(CASE WHEN cm.tipo = 'reembolso' THEN -cmn.monto_aplicado ELSE cmn.monto_aplicado END), 0) AS total
      FROM caja_movimiento_notas cmn
      JOIN caja_movimientos cm ON cm.id = cmn.movimiento_id
      WHERE cmn.prenota_id = ${notaId}
    `;
    const totalPagado = parseFloat(pagadoRows[0].total);
    const saldoPendiente = total - totalPagado;

    // 4. Validar que la nota no esté ya pagada
    if (saldoPendiente <= 0) {
      return NextResponse.json(
        { error: "Esta nota ya está pagada en su totalidad" },
        { status: 422 }
      );
    }

    // 6. Calcular monto_aplicado (cap al saldo pendiente). Slice 3a: el
    // sobrepago ya no se rechaza — se capa aquí y el excedente genera
    // crédito en el ledger de saldo a favor (si hay cliente_id).
    const montoAplicado = Math.min(monto, saldoPendiente);

    // Slice 3a — excedente del sobrepago (CLP entero). Solo genera crédito si
    // la nota pertenece a un cliente real (UUID); sin cliente_id se capa en silencio.
    const excedente = monto - saldoPendiente;
    const generaCredito = excedente > 0 && nota.cliente_id != null;
    const credito_generado = generaCredito ? excedente : 0;

    const usuarioId = parseInt((session!.user as any).id, 10);
    const usuarioNombre = (session!.user as any).nombre as string;

    // 8. Una sola sentencia atómica (BUG-031): inserta el cobro, su vínculo
    // con la nota Y el crédito de saldo a favor (si aplica) en un mismo CTE.
    // Si cualquiera de los INSERTs falla, Postgres revierte todo — cero cobros
    // huérfanos y cero créditos huérfanos (Slice 3a, patrón BUG-031).
    const movRows = await sql`
      WITH mov AS (
        INSERT INTO caja_movimientos (
          fecha, tipo, kcodcli2, nombre_cliente, cuenta_id, moneda,
          monto, forma_pago, observaciones,
          empresa, es_credito, usuario_id, usuario_nombre
        ) VALUES (
          CURRENT_DATE, 'cobro',
          ${nota.cliente_id ?? null}, ${nota.nombre_cliente ?? null},
          ${cuenta_id}, 'CLP',
          ${monto},
          ${forma_pago}, ${observaciones ?? null},
          ${EMPRESA.slug}, false, ${usuarioId}, ${usuarioNombre}
        )
        RETURNING id, fecha::text, tipo, kcodcli2 AS cliente_id, nombre_cliente,
          cuenta_id, moneda, monto, forma_pago,
          observaciones, empresa, es_credito, usuario_id, usuario_nombre,
          created_at::text, updated_at::text
      ),
      credito AS (
        -- Slice 3a: crédito por sobrepago. El WHERE (abajo) hace que el
        -- SELECT no produzca filas cuando no aplica (pago exacto, sin cliente,
        -- o excedente <= 0.005) → INSERT de 0 filas, sin violar NOT NULL.
        INSERT INTO clientes_saldo_favor_movimientos (
          cliente_id, tipo, monto, origen_prenota_id,
          usuario_id, usuario_nombre, observaciones
        )
        SELECT ${nota.cliente_id}, 'credito', ${excedente}, ${notaId},
          ${usuarioId}, ${usuarioNombre}, 'Excedente de pago — saldo a favor'
        FROM mov
        WHERE ${generaCredito}
        RETURNING id
      )
      INSERT INTO caja_movimiento_notas (movimiento_id, empresa, prenota_id, monto_aplicado)
      SELECT mov.id, ${EMPRESA.slug}, ${notaId}, ${montoAplicado}
      FROM mov
      RETURNING
        (SELECT id FROM mov) AS id,
        (SELECT fecha FROM mov) AS fecha,
        (SELECT tipo FROM mov) AS tipo,
        (SELECT cliente_id FROM mov) AS cliente_id,
        (SELECT nombre_cliente FROM mov) AS nombre_cliente,
        (SELECT cuenta_id FROM mov) AS cuenta_id,
        (SELECT moneda FROM mov) AS moneda,
        (SELECT monto FROM mov) AS monto,
        (SELECT forma_pago FROM mov) AS forma_pago,
        (SELECT observaciones FROM mov) AS observaciones,
        (SELECT empresa FROM mov) AS empresa,
        (SELECT es_credito FROM mov) AS es_credito,
        (SELECT usuario_id FROM mov) AS usuario_id,
        (SELECT usuario_nombre FROM mov) AS usuario_nombre,
        (SELECT created_at FROM mov) AS created_at,
        (SELECT updated_at FROM mov) AS updated_at
    `;
    const cobro = movRows[0];

    return NextResponse.json(
      {
        cobro,
        monto_aplicado: montoAplicado,
        saldo_pendiente_restante: saldoPendiente - montoAplicado,
        credito_generado,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/notas-venta/[id]/pagar error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
