import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { CajaImputacionCreateSchema } from "@/docs/specs/caja-mayor.spec";
import { formatCLP } from "@/lib/utils";

function guard(session: any) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = (session.user as any).rol;
  if (rol !== "admin") {
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

  // movimientoId es ahora un UUID (string), ya no un SERIAL
  const movimientoId = (await params).id;

  try {
    const body = await request.json();
    const parsed = CajaImputacionCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { notas } = parsed.data;

    // Fetch movement
    const movRows = await sql`
      SELECT id, tipo, kcodcli2, monto, empresa
      FROM caja_movimientos
      WHERE id = ${movimientoId}
    `;
    if (movRows.length === 0) {
      return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 });
    }

    const mov = movRows[0];

    // R11: must be a cobro
    if (mov.tipo !== "cobro") {
      return NextResponse.json(
        { error: "Solo se pueden imputar notas a cobros" },
        { status: 422 }
      );
    }

    // R12: must have a client
    if (!mov.kcodcli2) {
      return NextResponse.json(
        { error: "El movimiento no tiene cliente asignado" },
        { status: 422 }
      );
    }

    const kcodcli2 = mov.kcodcli2; // UUID (string) desde 13a
    const montoDisponible = Number(mov.monto);

    // ponytail: Slice 13 — repunte. Validate against prenotas, not movidcto.
    // BUG-009: migrado — ahora usa prenota_id directamente.
    let totalImputado = 0;
    const notasValidadas: { prenota_id: number; monto_aplicado: number; total_nota: number; total_previo: number }[] = [];

    for (const n of notas) {
      const prenotaId = typeof n.prenota_id === 'string' ? parseInt(n.prenota_id, 10) : n.prenota_id;
      if (isNaN(prenotaId)) {
        return NextResponse.json({ error: `Nota ${n.prenota_id}: ID inválido` }, { status: 422 });
      }

      // R14: nota must exist for this client
      const notaRows = await sql`
        SELECT
          p.id,
          COALESCE(SUM(pi.subtotal), 0) AS total
        FROM public.prenotas p
        LEFT JOIN public.prenota_items pi ON pi.prenota_id = p.id
        WHERE p.id = ${prenotaId} AND p.cliente_id = ${kcodcli2}
        GROUP BY p.id
        LIMIT 1
      `;

      if (notaRows.length === 0) {
        return NextResponse.json(
          { error: `Nota #${prenotaId} no encontrada para el cliente` },
          { status: 422 }
        );
      }

      const totalNota = parseFloat(notaRows[0].total);

      // R15: monto_aplicado <= saldo pendiente
      const pagadoRows = await sql`
        SELECT COALESCE(SUM(cmn.monto_aplicado), 0) AS total
        FROM caja_movimiento_notas cmn
        WHERE cmn.prenota_id = ${prenotaId}
          AND cmn.movimiento_id != ${movimientoId}
      `;
      const totalPrevio = parseFloat(pagadoRows[0].total);
      const saldoDisponible = totalNota - totalPrevio;

      if (n.monto_aplicado > saldoDisponible) {
        return NextResponse.json(
          { error: `Nota #${prenotaId}: monto ${formatCLP(n.monto_aplicado)} excede saldo pendiente ${formatCLP(saldoDisponible)}` },
          { status: 422 }
        );
      }

      totalImputado += n.monto_aplicado;
      notasValidadas.push({ prenota_id: prenotaId, monto_aplicado: n.monto_aplicado, total_nota: totalNota, total_previo: totalPrevio });
    }

    // R13: total imputado <= monto disponible
    if (totalImputado > montoDisponible) {
      return NextResponse.json(
        { error: `El total imputado (${formatCLP(totalImputado)}) excede el monto del cobro (${formatCLP(montoDisponible)})` },
        { status: 422 }
      );
    }

    // Replace: delete existing, insert new.
    await sql`DELETE FROM caja_movimiento_notas WHERE movimiento_id = ${movimientoId}`;

    const inserted: any[] = [];
    for (const n of notasValidadas) {
      const rows = await sql`
        INSERT INTO caja_movimiento_notas (movimiento_id, empresa, prenota_id, monto_aplicado)
        VALUES (${movimientoId}, 'bazar-naty', ${n.prenota_id}, ${n.monto_aplicado})
        RETURNING id, empresa, prenota_id, monto_aplicado
      `;
      inserted.push(rows[0]);
    }

    return NextResponse.json(
      {
        data: {
          movimiento_id: movimientoId,
          total_imputado: totalImputado,
          monto_disponible: montoDisponible - totalImputado,
          notas: inserted,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
