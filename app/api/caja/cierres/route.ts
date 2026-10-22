import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import type { CuentaCierreResumen, CierrePeriodo } from "@/docs/specs/caja-mayor.spec";

function guard(session: any) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = (session.user as any).rol;
  if (rol !== "admin") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const g = guard(session);
  if (g) return g;

  try {
    const rows = await sql`
      SELECT id, fecha_desde::text, fecha_hasta::text, resumen,
        usuario_id, usuario_nombre, created_at::text
      FROM caja_cierres
      ORDER BY fecha_hasta DESC
    `;

    const data: CierrePeriodo[] = rows.map((r: any) => ({
      id: r.id,
      fecha_desde: r.fecha_desde,
      fecha_hasta: r.fecha_hasta,
      resumen: r.resumen as CuentaCierreResumen[],
      usuario_id: r.usuario_id,
      usuario_nombre: r.usuario_nombre,
      created_at: r.created_at,
    }));

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(_request: Request) {
  void _request;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = (session.user as any).rol;
  if (rol !== "admin") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  try {
    // Determine fecha_hasta = today
    const hoy = new Date().toISOString().slice(0, 10);

    // Find fecha_desde from last cierre or saldos iniciales
    const ultimoCierre = await sql`
      SELECT fecha_hasta::text, resumen FROM caja_cierres ORDER BY fecha_hasta DESC LIMIT 1
    `;

    let fechaDesde: string;
    if (ultimoCierre.length > 0) {
      // Day after last cierre's fecha_hasta
      const lastDate = new Date(ultimoCierre[0].fecha_hasta);
      lastDate.setDate(lastDate.getDate() + 1);
      fechaDesde = lastDate.toISOString().slice(0, 10);
    } else {
      // First cierre: use earliest saldo inicial date
      const saldoRows = await sql`
        SELECT MIN(fecha)::text AS min_fecha FROM caja_saldos_iniciales
      `;
      if (!saldoRows[0]?.min_fecha) {
        return NextResponse.json(
          { error: "Configura saldos iniciales antes de crear un cierre" },
          { status: 422 }
        );
      }
      fechaDesde = saldoRows[0].min_fecha;
    }

    // Validate: must have movements in the period
    const movCount = await sql`
      SELECT COUNT(*)::int AS total
      FROM caja_movimientos
      WHERE fecha >= ${fechaDesde}::date AND fecha <= ${hoy}::date
    `;
    if (movCount[0].total === 0) {
      return NextResponse.json(
        { error: "No hay movimientos en el período para cerrar" },
        { status: 422 }
      );
    }

    // Build resumen by account
    const cuentas = await sql`
      SELECT id, nombre FROM caja_cuentas WHERE activa = true ORDER BY orden ASC
    `;

    const resumen: CuentaCierreResumen[] = [];

    for (const c of cuentas) {
      // saldo_anterior: from last cierre for this cuenta, or saldo_inicial
      // BUG-010: centinela null (no 0) — desambigua "no encontrada" de "valor real es 0"
      let saldoAnterior: number | null = null;

      // Reuse ultimoCierre (ya consultado fuera del loop), no re-consultar N+1 veces
      if (ultimoCierre.length > 0) {
        const resumenArray = ultimoCierre[0].resumen as CuentaCierreResumen[];
        const cuentaEnCierre = resumenArray.find((r) => r.cuenta_id === c.id);
        if (cuentaEnCierre) {
          saldoAnterior = cuentaEnCierre.saldo_final;
        }
      }

      // If not found in last cierre → saldo_inicial directo (sin scan de cierres viejos)
      // Decisión de negocio Pablo 2026-07-06: si la cuenta no aparece en el último
      // cierre, arranca desde saldo_inicial, no arrastra valores de cierres pasados.
      if (saldoAnterior === null) {
        const saldoInicialRow = await sql`
          SELECT saldo FROM caja_saldos_iniciales WHERE cuenta_id = ${c.id}
        `;
        if (saldoInicialRow.length > 0) {
          saldoAnterior = parseFloat(saldoInicialRow[0].saldo);
        } else {
          saldoAnterior = 0;
        }
      }

      // total_cobros and total_gastos in period
      const movs = await sql`
        SELECT
          COALESCE(SUM(CASE WHEN tipo = 'cobro' THEN monto ELSE 0 END), 0) AS total_cobros,
          COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN monto ELSE 0 END), 0) AS total_gastos,
          COALESCE(SUM(CASE WHEN tipo = 'reembolso' THEN monto ELSE 0 END), 0) AS total_reembolsos
        FROM caja_movimientos
        WHERE cuenta_id = ${c.id}
          AND fecha >= ${fechaDesde}::date AND fecha <= ${hoy}::date
      `;

      const totalCobros = parseFloat(movs[0].total_cobros);
      const totalGastos = parseFloat(movs[0].total_gastos);
      const totalReembolsos = parseFloat(movs[0].total_reembolsos);
      const saldoFinal = saldoAnterior + totalCobros - totalGastos - totalReembolsos;

      resumen.push({
        cuenta_id: c.id,
        cuenta_nombre: c.nombre,
        saldo_anterior: saldoAnterior,
        total_cobros: totalCobros,
        total_gastos: totalGastos,
        total_reembolsos: totalReembolsos,
        saldo_final: saldoFinal,
      });
    }

    const usuarioId = parseInt((session!.user as any).id, 10);
    const usuarioNombre = (session!.user as any).nombre as string;

    const insertRows = await sql`
      INSERT INTO caja_cierres (fecha_desde, fecha_hasta, resumen, usuario_id, usuario_nombre, creado_por)
      VALUES (${fechaDesde}::date, ${hoy}::date, ${JSON.stringify(resumen)}::jsonb, ${usuarioId}, ${usuarioNombre}, ${usuarioNombre})
      RETURNING id, fecha_desde::text, fecha_hasta::text, resumen, usuario_id, usuario_nombre, creado_por, created_at::text
    `;

    const result: CierrePeriodo = {
      id: insertRows[0].id,
      fecha_desde: insertRows[0].fecha_desde,
      fecha_hasta: insertRows[0].fecha_hasta,
      resumen: insertRows[0].resumen as CuentaCierreResumen[],
      usuario_id: insertRows[0].usuario_id,
      usuario_nombre: insertRows[0].usuario_nombre,
      created_at: insertRows[0].created_at,
    };

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
