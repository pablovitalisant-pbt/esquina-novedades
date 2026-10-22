import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import {
  CajaMovimientoUpdateSchema,
  roundUpToHalf,
} from "@/docs/specs/caja-mayor.spec";

function guard(session: any) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = (session.user as any).rol;
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

    // Determine effective moneda and monto
    const newMoneda = updates.moneda ?? current.moneda;
    const newMonto = updates.monto ?? parseFloat(current.monto);
    const monedaChanged = updates.moneda !== undefined && updates.moneda !== current.moneda;
    const montoChanged = updates.monto !== undefined;

    let montoUsd: number;
    let tipoCambio: number | null;

    if (newMoneda === "USD") {
      // R23 / R26: USD → monto_usd = monto, tipo_cambio = null
      montoUsd = newMonto;
      tipoCambio = null;
    } else {
      // ARS — needs dolar_dia
      const dolarRows = await sql`
        SELECT valor FROM caja_config WHERE clave = 'dolar_dia'
      `;
      const dolarDia = parseFloat(dolarRows[0]?.valor || "0");
      if (dolarDia <= 0) {
        return NextResponse.json(
          { error: "Dólar del día no configurado. Contacta al administrador." },
          { status: 422 }
        );
      }

      if (monedaChanged || montoChanged) {
        // R24 / R25: recalculate with current dolar_dia from caja_config
        montoUsd = roundUpToHalf(newMonto / dolarDia);
        tipoCambio = dolarDia;
      } else {
        // Neither changed: preserve existing values
        montoUsd = parseFloat(current.monto_usd);
        tipoCambio = current.tipo_cambio ? parseFloat(current.tipo_cambio) : null;
      }
    }

    // R27: if monto_usd decreased, auto-adjust imputaciones
    let ajusteRequerido: { diferencia: number; mensaje: string } | null = null;
    if (montoUsd < parseFloat(current.monto_usd || "0") - 0.005) {
      const imputado = await sql`
        SELECT COALESCE(SUM(monto_aplicado), 0) AS total
        FROM caja_movimiento_notas WHERE movimiento_id = ${movimientoId}
      `;
      const totalImputado = parseFloat(imputado[0].total);
      if (totalImputado > montoUsd + 0.005) {
        const diferencia = Math.round((totalImputado - montoUsd) * 100) / 100;

        // Reducir imputaciones empezando por la última (ORDER BY id DESC)
        const notas = await sql`
          SELECT id, monto_aplicado
          FROM caja_movimiento_notas
          WHERE movimiento_id = ${movimientoId}
          ORDER BY id DESC
        `;

        let pendiente = Math.round(diferencia * 100) / 100;
        for (const nota of notas) {
          if (pendiente <= 0.005) break;
          const montoActual = parseFloat(nota.monto_aplicado);
          const reduccion = Math.round(Math.min(montoActual, pendiente) * 100) / 100;
          const nuevoMonto = Math.round((montoActual - reduccion) * 100) / 100;
          await sql`
            UPDATE caja_movimiento_notas
            SET monto_aplicado = ${nuevoMonto}
            WHERE id = ${nota.id}
          `;
          pendiente = Math.round((pendiente - reduccion) * 100) / 100;
        }

        ajusteRequerido = {
          diferencia,
          mensaje: `El total imputado supera el monto por $${diferencia.toFixed(2)} USD. Se ajustó automáticamente.`,
        };
      }
    }

    // R30: if tipo is "gasto" and empresa not provided, set to null
    const newEmpresa = updates.empresa !== undefined ? updates.empresa
      : (newTipo === "gasto" && updates.tipo === "gasto" ? null : current.empresa);

    const usuarioNombre = (session!.user as any).nombre as string;

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
          moneda = ${newMoneda},
          monto = ${newMonto},
          monto_usd = ${montoUsd},
          tipo_cambio = ${tipoCambio},
          forma_pago = COALESCE(${updateFormaPago}, forma_pago),
          observaciones = ${updateObservaciones},
          empresa = ${newEmpresa},
          es_credito = ${updateEsCredito},
          usuario_nombre = ${usuarioNombre},
          updated_at = now()
      WHERE id = ${movimientoId}
      RETURNING id, fecha::text, tipo, kcodcli2 AS cliente_id, nombre_cliente,
        cuenta_id, moneda, monto, monto_usd, tipo_cambio, forma_pago,
        observaciones, empresa, es_credito, usuario_id, usuario_nombre,
        created_at::text, updated_at::text
    `;

    const result: Record<string, unknown> = { data: updated[0] };
    if (ajusteRequerido) {
      result.ajuste_requerido = ajusteRequerido;
    }
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
