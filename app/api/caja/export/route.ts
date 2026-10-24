import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import type { MovimientoConCuenta, CierrePeriodo, MovimientoOCierre, CuentaCierreResumen } from "@/docs/specs/caja-mayor.spec";
import type { SessionUser } from "../_types";

interface CierreExportRow {
  id: number;
  fecha_desde: string;
  fecha_hasta: string;
  resumen: CuentaCierreResumen[] | string;
  usuario_id: number;
  usuario_nombre: string;
  created_at: string;
}

interface MovimientoFechaRow {
  fecha: string;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = (session.user as SessionUser).rol;
  if (rol !== "admin") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);

    const cuentaId = searchParams.get("cuenta_id") ? parseInt(searchParams.get("cuenta_id")!, 10) : null;
    const tipoFiltro = searchParams.get("tipo") || null;
    const empresaFiltro = searchParams.get("empresa") || null;
    const desde = searchParams.get("desde") || null;
    const hasta = searchParams.get("hasta") || null;

    // Fetch all matching movements (no pagination — limit high enough for practical use)
    const rows = await sql`
      SELECT m.id, m.fecha::text, m.tipo, m.kcodcli2, m.nombre_cliente,
        m.cuenta_id, cc.nombre AS cuenta_nombre, m.moneda, m.monto, m.forma_pago, m.observaciones, m.empresa, m.es_credito,
        COALESCE((
          SELECT ARRAY_AGG(cmn.prenota_id::text ORDER BY cmn.id)
          FROM caja_movimiento_notas cmn
          WHERE cmn.movimiento_id = m.id
        ), '{}') AS notas_imputadas,
        m.usuario_id, m.usuario_nombre, m.created_at::text, m.updated_at::text
      FROM caja_movimientos m
      JOIN caja_cuentas cc ON cc.id = m.cuenta_id
      WHERE (${cuentaId}::int IS NULL OR m.cuenta_id = ${cuentaId})
        AND (${tipoFiltro}::text IS NULL OR m.tipo = ${tipoFiltro})
        AND (${empresaFiltro}::text IS NULL OR m.empresa = ${empresaFiltro})
        AND (${desde}::date IS NULL OR m.fecha >= ${desde}::date)
        AND (${hasta}::date IS NULL OR m.fecha <= ${hasta}::date)
      ORDER BY m.fecha DESC, m.id DESC
      LIMIT 9999
    `;

    // Fetch cierres within the filtered date range
    let cierresEnRango: CierrePeriodo[] = [];
    try {
      const minFecha = desde || "2000-01-01";
      const maxFecha = hasta || new Date().toISOString().slice(0, 10);

      const cierresRows = await sql`
        SELECT id, fecha_desde::text, fecha_hasta::text, resumen,
          usuario_id, usuario_nombre, created_at::text
        FROM caja_cierres
        WHERE fecha_hasta >= ${minFecha}::date
          AND fecha_desde <= ${maxFecha}::date
        ORDER BY fecha_hasta ASC
      `;

      cierresEnRango = (cierresRows as CierreExportRow[]).map((r) => ({
        id: r.id,
        fecha_desde: r.fecha_desde,
        fecha_hasta: r.fecha_hasta,
        resumen: typeof r.resumen === "string" ? JSON.parse(r.resumen) : r.resumen,
        usuario_id: r.usuario_id,
        usuario_nombre: r.usuario_nombre,
        created_at: r.created_at,
      }));
    } catch {
      cierresEnRango = [];
    }

    // Wrap movements
    const data: MovimientoOCierre[] = rows.map((row) => ({
      tipo_fila: "movimiento" as const,
      data: row as MovimientoConCuenta,
    }));

    // Intercalate ALL cierres whose fecha_hasta >= oldest movement date
    // Include cierres with fecha_hasta beyond the newest movement (same as page-1 fix)
    const fechasMovimientos = (rows as MovimientoFechaRow[]).map((r) => r.fecha);
    const fechaMinExport = fechasMovimientos.length ? fechasMovimientos[fechasMovimientos.length - 1] : null;
    const fechaMaxExport = fechasMovimientos.length ? fechasMovimientos[0] : null;

    const cierresAIntercalar = fechaMinExport && fechaMaxExport
      ? cierresEnRango.filter(c =>
          c.fecha_hasta >= fechaMinExport &&
          (c.fecha_hasta <= fechaMaxExport || true) // always include cierres beyond max date
        )
      : cierresEnRango; // no movements → include all cierres

    // Intercalate cierres (sorted ASC) into movimientos (sorted DESC)
    if (cierresAIntercalar.length > 0) {
      let cierreIdx = cierresAIntercalar.length - 1;
      const merged: MovimientoOCierre[] = [];
      for (const item of data) {
        const mov = item.data as MovimientoConCuenta;
        while (cierreIdx >= 0 && cierresAIntercalar[cierreIdx].fecha_hasta >= mov.fecha) {
          merged.push({ tipo_fila: "cierre", data: cierresAIntercalar[cierreIdx] });
          cierreIdx--;
        }
        merged.push(item);
      }
      while (cierreIdx >= 0) {
        merged.push({ tipo_fila: "cierre", data: cierresAIntercalar[cierreIdx] });
        cierreIdx--;
      }
      return NextResponse.json({ data: merged });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
