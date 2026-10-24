import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { calcularPrecio } from "@/lib/calcular-precio";
import { esPrecioMayorValido } from "@/lib/precio-mayor";
import type { UserSession } from "@/types";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as UserSession;
  if (user.rol !== 'admin') {
    return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { codigo, detalle, costo, margen_pct, saldo, stock_minimo, cantcaja } = body;

    // Validaciones
    if (!codigo || !codigo.trim()) {
      return NextResponse.json({ error: "Código requerido" }, { status: 400 });
    }
    if (!detalle || !detalle.trim()) {
      return NextResponse.json({ error: "Descripción requerida" }, { status: 400 });
    }
    if (costo === undefined || Number(costo) <= 0) {
      return NextResponse.json({ error: "Costo debe ser mayor a 0" }, { status: 400 });
    }
    if (margen_pct === undefined || Number(margen_pct) < 0) {
      return NextResponse.json({ error: "Porcentaje de ganancia es requerido y no puede ser negativo" }, { status: 400 });
    }
    if (saldo !== undefined && Number(saldo) < 0) {
      return NextResponse.json({ error: "Stock inicial no puede ser negativo" }, { status: 400 });
    }
    if (stock_minimo !== undefined && (isNaN(Number(stock_minimo)) || Number(stock_minimo) < 0)) {
      return NextResponse.json({ error: "Stock minimo no puede ser negativo" }, { status: 400 });
    }
    // cantcaja: entero >= 1 si se envía (mismo mensaje que PUT /api/productos/[id]).
    // Excluye boolean (true → Number=1 pasaría el check numérico) — consistente con
    // esNumeroValido del PUT.
    if (cantcaja !== undefined && (typeof cantcaja === "boolean" || !Number.isFinite(Number(cantcaja)) || !Number.isInteger(Number(cantcaja)) || Number(cantcaja) < 1)) {
      return NextResponse.json({ error: "Cantidad por caja debe ser al menos 1" }, { status: 400 });
    }

    const precioMayor = body.precio_mayor === undefined ? null : body.precio_mayor;
    if (!esPrecioMayorValido(precioMayor)) {
      return NextResponse.json({ error: "Precio por caja debe ser un entero mayor a 0 o vacio" }, { status: 400 });
    }

    // Calcular prcventa: servidor es la única fuente del cálculo (invariante anti-drift)
    const costoNum = Number(costo);
    const margenNum = Number(margen_pct);
    const prcventaCalculado = calcularPrecio(costoNum, margenNum);
    // cantcaja opcional: default 1 (mismo comportamiento que antes del slice)
    const cantcajaNum = cantcaja !== undefined ? Number(cantcaja) : 1;

    // Chequear duplicado
    const empresaId = user.empresas?.[0] ?? 1;
    const dup = await sql`SELECT id FROM productos WHERE empresa_id = ${empresaId} AND codigo = ${codigo.trim()}`;
    if (dup.length > 0) {
      return NextResponse.json({ error: `Ya existe un producto con el código ${codigo.trim()}` }, { status: 409 });
    }

    // Insertar
    const result = await sql`
      INSERT INTO productos (empresa_id, codigo, detalle, prcventa, costo, cif, margen_pct, saldo, umed, cantcaja, pesocaja, cubicaja, es_nuevo, prcminimo, categoria, stock_minimo, precio_mayor)
      VALUES (${empresaId}, ${codigo.trim()}, ${detalle.trim()}, ${prcventaCalculado}, ${costoNum}, ${costoNum}, ${margenNum}, ${saldo !== undefined ? Number(saldo) : 0}, 'U', ${cantcajaNum}, 0, 0, true, null, null, ${stock_minimo !== undefined ? Number(stock_minimo) : null}, ${precioMayor})
      RETURNING *
    `;

    return NextResponse.json({ data: result[0] }, { status: 201 });
  } catch (error) {
    console.error("POST /api/productos error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if ((session.user as UserSession).rol === 'bodeguero') {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.toLowerCase() || '';
  const soloStock = searchParams.get('soloStock') === 'true';
  const soloNuevo = searchParams.get('soloNuevo') === 'true';

  try {
    const searchPattern = `%${search}%`;
    if (!search) {
      return NextResponse.json({ data: [] });
    }

    const empresaIds = (session.user as UserSession).empresas || [];
    const rows = await sql`
      SELECT
        p.codigo,
        MAX(p.id) as id,
        MAX(p.detalle) as detalle,
        SUM(p.saldo) as saldo,
        MAX(p.prcventa) as prcventa,
        MAX(p.prcminimo) as prcminimo,
        MAX(p.precio_mayor) as precio_mayor,
        MAX(p.costo) as costo,
        MAX(p.margen_pct) as margen_pct,
        MAX(p.cif) as cif,
        MAX(p.umed) as umed,
        MAX(p.imagen_url) as imagen_url,
        BOOL_OR(p.es_nuevo) as es_nuevo,
        MAX(p.cantcaja) as cantcaja,
        MAX(p.pesocaja) as pesocaja,
        MAX(p.cubicaja) as cubicaja,
        MAX(p.stock_minimo) as stock_minimo,
        MAX(p.nroingreso) as nroingreso,
        MAX(p.empresa_id) as empresa_id,
        MAX(e.nombre) as nombre_empresa
      FROM productos p
      JOIN empresas e ON e.id = p.empresa_id
      WHERE p.empresa_id = ANY(${empresaIds})
        AND p.activo = true
        AND (${search} = '' OR LOWER(p.codigo) LIKE ${searchPattern} OR LOWER(p.detalle) LIKE ${searchPattern})
      GROUP BY p.codigo
      HAVING
        (${soloStock} = false OR SUM(saldo) > 0)
        AND (${soloNuevo} = false OR BOOL_OR(p.es_nuevo) = true)
      ORDER BY p.codigo ASC
      LIMIT 200
    `;

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("GET /api/productos error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
