import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { CajaMovimientoCreateSchema } from "@/docs/specs/caja-mayor.spec";
import type { MovimientoConCuenta, CierrePeriodo, MovimientoOCierre, MovimientosPaginadosConCierres, CuentaCierreResumen } from "@/docs/specs/caja-mayor.spec";
import type { SessionUser } from "../_types";

interface CierreRow {
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
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
    const offset = (page - 1) * limit;

    // Filters — null means "no filter"
    const cuentaId = searchParams.get("cuenta_id") ? parseInt(searchParams.get("cuenta_id")!, 10) : null;
    const tipoFiltro = searchParams.get("tipo") || null;
    const empresaFiltro = searchParams.get("empresa") || null;
    const desde = searchParams.get("desde") || null;
    const hasta = searchParams.get("hasta") || null;

    // Safe parameterized query: COALESCE/IS NULL pattern — no string interpolation
    const rows = await sql`
      SELECT m.id, m.fecha::text, m.tipo, m.kcodcli2 AS cliente_id, m.nombre_cliente,
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
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Count total (same filters)
    const countRows = await sql`
      SELECT COUNT(*)::int AS total
      FROM caja_movimientos m
      WHERE (${cuentaId}::int IS NULL OR m.cuenta_id = ${cuentaId})
        AND (${tipoFiltro}::text IS NULL OR m.tipo = ${tipoFiltro})
        AND (${empresaFiltro}::text IS NULL OR m.empresa = ${empresaFiltro})
        AND (${desde}::date IS NULL OR m.fecha >= ${desde}::date)
        AND (${hasta}::date IS NULL OR m.fecha <= ${hasta}::date)
    `;

    const total = countRows[0].total as number;

    // Fetch cierres within the filtered date range (non-blocking)
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

      cierresEnRango = (cierresRows as CierreRow[]).map((r) => ({
        id: r.id,
        fecha_desde: r.fecha_desde,
        fecha_hasta: r.fecha_hasta,
        resumen: typeof r.resumen === "string" ? JSON.parse(r.resumen) : r.resumen,
        usuario_id: r.usuario_id,
        usuario_nombre: r.usuario_nombre,
        created_at: r.created_at,
      }));
    } catch {
      // cierres table might not exist yet — continue without cierres
      cierresEnRango = [];
    }

    // Wrap movimientos as MovimientoOCierre
    const data: MovimientoOCierre[] = rows.map((row) => ({
      tipo_fila: "movimiento" as const,
      data: row as MovimientoConCuenta,
    }));

    // Solo intercalar cierres cuyas fechas caen dentro de esta página
    const fechasMovimientos = (rows as MovimientoFechaRow[]).map((r) => r.fecha);
    const fechaMinPagina = fechasMovimientos.length ? fechasMovimientos[fechasMovimientos.length - 1] : null;
    const fechaMaxPagina = fechasMovimientos.length ? fechasMovimientos[0] : null;
    const cierresDePagina = fechaMinPagina && fechaMaxPagina
      ? cierresEnRango.filter(c =>
          c.fecha_hasta >= fechaMinPagina &&
          (c.fecha_hasta <= fechaMaxPagina || page === 1)
        )
      : (page === 1 ? cierresEnRango : []);

    // Intercalate cierres (sorted ASC) into movimientos (sorted DESC)
    if (cierresDePagina.length > 0) {
      let cierreIdx = cierresDePagina.length - 1;
      const merged: MovimientoOCierre[] = [];
      for (const item of data) {
        const mov = item.data as MovimientoConCuenta;
        while (cierreIdx >= 0 && cierresDePagina[cierreIdx].fecha_hasta >= mov.fecha) {
          merged.push({ tipo_fila: "cierre", data: cierresDePagina[cierreIdx] });
          cierreIdx--;
        }
        merged.push(item);
      }
      while (cierreIdx >= 0) {
        merged.push({ tipo_fila: "cierre", data: cierresDePagina[cierreIdx] });
        cierreIdx--;
      }
      return NextResponse.json({
        data: merged,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        cierres_en_rango: cierresEnRango,
      } satisfies MovimientosPaginadosConCierres);
    }

    return NextResponse.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      cierres_en_rango: [],
    } satisfies MovimientosPaginadosConCierres);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

function guard(session: Session | null) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = (session.user as SessionUser).rol;
  if (rol !== "admin") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }
  return null;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const g = guard(session);
  if (g) return g;

  try {
    const body = await request.json();
    const parsed = CajaMovimientoCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { fecha, tipo, kcodcli2, nombre_cliente, cuenta_id, monto, forma_pago, observaciones, empresa, es_credito } = parsed.data;
    // UUID opcional. Se toma del body crudo porque el schema (Zod) descarta
    // campos desconocidos.
    const id = body?.id ?? null;

    // R6: gasto → empresa can be null
    const finalEmpresa = tipo === "gasto" ? (empresa ?? null) : empresa;

    // ponytail: Slice 13 — validate against prenotas instead of movidcto.
    if (kcodcli2 && finalEmpresa) {
      const checkResult = await sql`SELECT 1 FROM public.prenotas WHERE cliente_id = ${kcodcli2} LIMIT 1`;
      if (checkResult.length === 0) {
        return NextResponse.json(
          { error: "El cliente no tiene compras en la empresa seleccionada" },
          { status: 422 }
        );
      }
    }

    const usuarioId = parseInt((session!.user as SessionUser).id, 10);
    const usuarioNombre = (session!.user as SessionUser).nombre;

    const rows = await sql`
      INSERT INTO caja_movimientos (
        id, fecha, tipo, kcodcli2, nombre_cliente, cuenta_id, moneda,
        monto, forma_pago, observaciones,
        empresa, es_credito, usuario_id, usuario_nombre
      ) VALUES (
        COALESCE(${id ?? null}, gen_random_uuid()), ${fecha}::date, ${tipo},
        ${kcodcli2 ?? null}, ${nombre_cliente ?? null},
        ${cuenta_id}, 'CLP',
        ${monto},
        ${forma_pago}, ${observaciones ?? null},
        ${finalEmpresa ?? null}, ${es_credito ?? false}, ${usuarioId}, ${usuarioNombre}
      )
      -- Retry-safety: si el INSERT del movimiento sube pero la imputación
      -- después falla, un reintento repite este INSERT ya aplicado. ON CONFLICT (id) DO UPDATE SET
      -- id = EXCLUDED.id es un no-op sobre sí mismo que hace que RETURNING
      -- funcione en el reintento sin chocar contra la PK UUID.
      ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
      RETURNING id, fecha::text, tipo, kcodcli2 AS cliente_id, nombre_cliente,
        cuenta_id, moneda, monto, forma_pago,
        observaciones, empresa, es_credito, usuario_id, usuario_nombre,
        created_at::text, updated_at::text
    `;

    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
