import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { CajaMovimientoUpdateSchema } from "@/docs/specs/caja-mayor.spec";
import { formatCLP } from "@/lib/utils";
import type { SessionUser } from "../../_types";

function guard(session: Session | null) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = (session.user as SessionUser).rol;
  if (rol !== "admin") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }
  return null;
}

export async function PATCH(
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
    const parsed = CajaMovimientoUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    // Fetch current movement
    const rows = await sql`
      SELECT * FROM caja_movimientos WHERE id = ${movimientoId}
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 });
    }

    const current = rows[0];
    const updates = parsed.data;

    // R22: if tipo changes to "gasto", delete all imputaciones
    const newTipo = updates.tipo ?? current.tipo;
    if (current.tipo === "cobro" && newTipo === "gasto") {
      await sql`DELETE FROM caja_movimiento_notas WHERE movimiento_id = ${movimientoId}`;
    }

    // R28: if kcodcli2 changes and there were imputaciones, delete them
    // kcodcli2 es UUID (string) desde 13a → comparación directa de strings
    const newKcodcli2 = updates.kcodcli2 !== undefined ? updates.kcodcli2 : current.kcodcli2;
    if (current.kcodcli2 && newKcodcli2 !== (current.kcodcli2 ?? null)) {
      await sql`DELETE FROM caja_movimiento_notas WHERE movimiento_id = ${movimientoId}`;
    }

    const newMonto = updates.monto ?? Number(current.monto);

    // R27: if monto decreased, auto-adjust imputaciones (CLP entero, sin tolerancia)
    let ajusteRequerido: { diferencia: number; mensaje: string } | null = null;
    if (newMonto < Number(current.monto)) {
      const imputado = await sql`
        SELECT COALESCE(SUM(monto_aplicado), 0) AS total
        FROM caja_movimiento_notas WHERE movimiento_id = ${movimientoId}
      `;
      const totalImputado = Number(imputado[0].total);
      if (totalImputado > newMonto) {
        const diferencia = totalImputado - newMonto;

        // Reducir imputaciones empezando por la última (ORDER BY id DESC)
        const notas = await sql`
          SELECT id, monto_aplicado
          FROM caja_movimiento_notas
          WHERE movimiento_id = ${movimientoId}
          ORDER BY id DESC
        `;

        let pendiente = diferencia;
        for (const nota of notas) {
          if (pendiente <= 0) break;
          const montoActual = Number(nota.monto_aplicado);
          const reduccion = Math.min(montoActual, pendiente);
          await sql`
            UPDATE caja_movimiento_notas
            SET monto_aplicado = ${montoActual - reduccion}
            WHERE id = ${nota.id}
          `;
          pendiente -= reduccion;
        }

        ajusteRequerido = {
          diferencia,
          mensaje: `El total imputado supera el monto por ${formatCLP(diferencia)}. Se ajustó automáticamente.`,
        };
      }
    }

    // R30: if tipo is "gasto" and empresa not provided, set to null
    const newEmpresa = updates.empresa !== undefined ? updates.empresa
      : (newTipo === "gasto" && updates.tipo === "gasto" ? null : current.empresa);

    const usuarioNombre = (session!.user as SessionUser).nombre;

    // Apply updates with COALESCE
    const updateFecha = updates.fecha ?? null;
    const updateTipo = updates.tipo ?? null;
    const updateCuentaId = updates.cuenta_id ?? null;
    const updateFormaPago = updates.forma_pago ?? null;
    const updateKcodcli2 = updates.kcodcli2 !== undefined ? updates.kcodcli2 : current.kcodcli2;
    const updateNombreCliente = updates.nombre_cliente !== undefined ? updates.nombre_cliente : current.nombre_cliente;
    const updateObservaciones = updates.observaciones !== undefined ? updates.observaciones : current.observaciones;
    const updateEsCredito = updates.es_credito !== undefined ? updates.es_credito : current.es_credito;

    const updated = await sql`
      UPDATE caja_movimientos
      SET fecha = COALESCE(${updateFecha}::date, fecha),
          tipo = COALESCE(${updateTipo}, tipo),
          kcodcli2 = ${updateKcodcli2},
          nombre_cliente = ${updateNombreCliente},
          cuenta_id = COALESCE(${updateCuentaId}, cuenta_id),
          moneda = 'CLP',
          monto = ${newMonto},
          forma_pago = COALESCE(${updateFormaPago}, forma_pago),
          observaciones = ${updateObservaciones},
          empresa = ${newEmpresa},
          es_credito = ${updateEsCredito},
          usuario_nombre = ${usuarioNombre},
          updated_at = now()
      WHERE id = ${movimientoId}
      RETURNING id, fecha::text, tipo, kcodcli2 AS cliente_id, nombre_cliente,
        cuenta_id, moneda, monto, forma_pago,
        observaciones, empresa, es_credito, usuario_id, usuario_nombre,
        created_at::text, updated_at::text
    `;

    const result: Record<string, unknown> = { data: updated[0] };
    if (ajusteRequerido) {
      result.ajuste_requerido = ajusteRequerido;
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const g = guard(session);
  if (g) return g;

  // movimientoId es ahora un UUID (string), ya no un SERIAL
  const movimientoId = (await params).id;

  try {
    const rows = await sql`
      DELETE FROM caja_movimientos WHERE id = ${movimientoId} RETURNING id
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ data: { id: rows[0].id, eliminado: true } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
