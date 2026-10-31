import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { calcularMargen } from "@/lib/calcular-precio";
import { esPrecioMayorValido, esMinimoMayorValido } from "@/lib/precio-mayor";
import { mensajeError } from '@/lib/errores';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user;
  if (user.rol !== 'admin') {
    return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { codigo, detalle, costo, prcventa, saldo, stock_minimo, cantcaja } = body;

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
    // Slice 2a: el precio de venta se ingresa directamente (entero CLP).
    // margen_pct del body se ignora: el servidor lo calcula.
    if (typeof prcventa !== "number" || !Number.isInteger(prcventa) || prcventa <= 0) {
      return NextResponse.json({ error: "Precio por menor debe ser un entero mayor a 0" }, { status: 400 });
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
      return NextResponse.json({ error: "Precio por mayor debe ser un entero mayor a 0 o vacio" }, { status: 400 });
    }
    const pm: number | null = precioMayor === null ? null : Number(precioMayor);
    if (pm !== null && pm >= prcventa) {
      return NextResponse.json({ error: "Precio por mayor debe ser menor al precio por menor" }, { status: 400 });
    }

    const minimoMayor = body.minimo_mayor === undefined ? null : body.minimo_mayor;
    if (!esMinimoMayorValido(minimoMayor)) {
      return NextResponse.json({ error: "Unidades minimas para precio por mayor debe ser un entero mayor o igual a 1" }, { status: 400 });
    }
    if (minimoMayor !== null && pm === null) {
      return NextResponse.json({ error: "Unidades minimas para precio por mayor requiere un precio por mayor" }, { status: 400 });
    }

    // El margen SIEMPRE se calcula desde costo y prcventa (nunca desde el body).
    const margenCalculado = calcularMargen(Number(costo), prcventa);
    // cantcaja opcional: default 1 (mismo comportamiento que antes del slice)
    const cantcajaNum = cantcaja !== undefined ? Number(cantcaja) : 1;
    // Slice portada-auto: es_nuevo ahora significa "Destacar". Nuevo producto = false.
    const esNuevo = typeof body.es_nuevo === 'boolean' ? body.es_nuevo : false;

    // Chequear duplicado
    const empresaId = user.empresas?.[0] ?? 1;
    const dup = await sql`SELECT id FROM productos WHERE empresa_id = ${empresaId} AND codigo = ${codigo.trim()}`;
    if (dup.length > 0) {
      return NextResponse.json({ error: `Ya existe un producto con el código ${codigo.trim()}` }, { status: 409 });
    }

    // Insertar
    const result = await sql`
      INSERT INTO productos (empresa_id, codigo, detalle, prcventa, costo, cif, margen_pct, saldo, umed, cantcaja, pesocaja, cubicaja, es_nuevo, prcminimo, categoria, stock_minimo, precio_mayor, minimo_mayor)
      VALUES (${empresaId}, ${codigo.trim()}, ${detalle.trim()}, ${prcventa}, ${Number(costo)}, ${Number(costo)}, ${margenCalculado}, ${saldo !== undefined ? Number(saldo) : 0}, 'U', ${cantcajaNum}, 0, 0, ${esNuevo}, null, null, ${stock_minimo !== undefined ? Number(stock_minimo) : null}, ${pm}, ${minimoMayor})
      RETURNING *
    `;

    return NextResponse.json({ data: result[0] }, { status: 201 });
  } catch (error) {
    console.error("POST /api/productos error:", error);
    const message = mensajeError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.rol === 'bodeguero') {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.toLowerCase() || '';
  const soloStock = searchParams.get('soloStock') === 'true';
  const soloNuevo = searchParams.get('soloNuevo') === 'true';

  try {
    // Sin término de búsqueda devuelve el listado completo (máx. 200, orden
    // por código): lo usa el POS para pintar la grilla inicial.
    const searchPattern = `%${search}%`;
    const empresaIds = session.user.empresas || [];
    const rows = await sql`
      SELECT
        p.codigo,
        MAX(p.id) as id,
        MAX(p.detalle) as detalle,
        SUM(p.saldo) as saldo,
        MAX(p.prcventa) as prcventa,
        MAX(p.prcminimo) as prcminimo,
        MAX(p.precio_mayor) as precio_mayor,
        MAX(p.minimo_mayor) as minimo_mayor,
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
        MAX(p.categoria) as categoria,
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
    const message = mensajeError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
