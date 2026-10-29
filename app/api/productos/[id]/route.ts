import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { calcularMargen } from "@/lib/calcular-precio";
import { esPrecioMayorValido, esMinimoMayorValido } from "@/lib/precio-mayor";
import { mensajeError } from '@/lib/errores';

// ponytail: rechazar NaN/null — ver PBT-IA NaN/null bypass hallazgo
const esNumeroValido = (v: unknown): boolean =>
  v !== null && typeof v !== "boolean" && Number.isFinite(Number(v));

// BUG-umed-corrupto: umed es la unidad de medida, no una cantidad. Texto
// libre permitia guardar cantidades ("18U", "240") en vez de un codigo,
// rompiendo la vista de Packing en /precios. El frontend ahora ofrece un
// dropdown fijo (Unid / Set) — el servidor exige exactamente esos valores.
const UMED_VALORES_VALIDOS = ["U", "SET"];
const esUmedValido = (v: unknown): v is string =>
  typeof v === "string" && UMED_VALORES_VALIDOS.includes(v.trim());

// ponytail: whitelist de columnas — única fuente de verdad para el UPDATE dinámico.
// Nunca interpolar nombres de columna desde el body directamente.
// margen_pct está en el mapa porque el servidor lo escribe, pero NO se acepta del body.
const WHITELIST: Record<string, string> = {
  detalle: "detalle", costo: "costo", margen_pct: "margen_pct",
  prcventa: "prcventa", prcminimo: "prcminimo", umed: "umed",
  cantcaja: "cantcaja", pesocaja: "pesocaja", cubicaja: "cubicaja",
  es_nuevo: "es_nuevo", categoria: "categoria", imagen_url: "imagen_url",
  precio_mayor: "precio_mayor", minimo_mayor: "minimo_mayor",
  stock_minimo: "stock_minimo", no_reponer: "no_reponer", // Slice 15: "no reponer" offline
};
const CAMPOS_CLIENTE = Object.keys(WHITELIST).filter((k) => k !== "margen_pct");

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user;
  if (user.rol !== "admin") {
    return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const pid = parseInt((await context.params).id, 10);

    // Paso 1: extraer solo campos del whitelist presentes en el body
    const changes: Record<string, string | number | boolean | null> = {};
    for (const key of CAMPOS_CLIENTE) {
      if (body[key] !== undefined) changes[key] = body[key];
    }
    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ message: "Nada que actualizar" });
    }

    // Paso 2: validación de rango (fail-fast, sin SQL)
    // Nota: esNumeroValido rechaza NaN, null, boolean — previene bypass NaN > 0 = false
    if (changes.costo !== undefined && (!esNumeroValido(changes.costo) || Number(changes.costo) <= 0))
      return NextResponse.json({ error: "Costo debe ser mayor a 0" }, { status: 400 });
    // Slice 2a: prcventa es precio directo (entero CLP). margen_pct nunca se acepta del body.
    if (changes.prcventa !== undefined && (typeof changes.prcventa !== "number" || !Number.isInteger(changes.prcventa) || changes.prcventa <= 0))
      return NextResponse.json({ error: "Precio de venta debe ser un entero mayor a 0" }, { status: 400 });
    if (changes.prcminimo !== undefined && changes.prcminimo !== null && (!esNumeroValido(changes.prcminimo) || Number(changes.prcminimo) < 0))
      return NextResponse.json({ error: "Precio minimo no puede ser negativo" }, { status: 400 });
    if (changes.stock_minimo !== undefined && changes.stock_minimo !== null && (!esNumeroValido(changes.stock_minimo) || Number(changes.stock_minimo) < 0))
      return NextResponse.json({ error: "Stock minimo no puede ser negativo" }, { status: 400 });
    if (changes.cantcaja !== undefined && (!esNumeroValido(changes.cantcaja) || Number(changes.cantcaja) < 1))
      return NextResponse.json({ error: "Cantidad por caja debe ser al menos 1" }, { status: 400 });
    if (changes.pesocaja !== undefined && (!esNumeroValido(changes.pesocaja) || Number(changes.pesocaja) < 0))
      return NextResponse.json({ error: "Peso por caja no puede ser negativo" }, { status: 400 });
    if (changes.cubicaja !== undefined && (!esNumeroValido(changes.cubicaja) || Number(changes.cubicaja) < 0))
      return NextResponse.json({ error: "Cubicaje no puede ser negativo" }, { status: 400 });
    if (changes.precio_mayor !== undefined && !esPrecioMayorValido(changes.precio_mayor))
      return NextResponse.json({ error: "Precio mayor debe ser un entero mayor a 0 o vacio" }, { status: 400 });
    if (changes.minimo_mayor !== undefined && !esMinimoMayorValido(changes.minimo_mayor))
      return NextResponse.json({ error: "Unidades minimas para precio mayor debe ser un entero mayor o igual a 1" }, { status: 400 });
    if (changes.umed !== undefined && !esUmedValido(changes.umed))
      return NextResponse.json({ error: "Unidad de medida invalida: debe ser Unid o Set" }, { status: 400 });
    if (changes.umed !== undefined) changes.umed = changes.umed.trim();

    // Paso 3: access check + valores actuales para derivar el margen
    const existing = await sql`SELECT empresa_id, codigo, costo, prcventa, precio_mayor FROM productos WHERE id = ${pid}`;
    if (existing.length === 0)
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    if (!user.empresas.includes(existing[0].empresa_id))
      return NextResponse.json({ error: "No tienes acceso a este producto" }, { status: 403 });
    const codigo = existing[0].codigo;

    // Paso 4: validar categoria contra tabla (solo si presente y no null)
    if (changes.categoria !== undefined && changes.categoria !== null) {
      const catFound = await sql`SELECT nombre FROM categorias WHERE nombre = ${changes.categoria} LIMIT 1`;
      if (catFound.length === 0)
        return NextResponse.json({ error: "Categoria no valida" }, { status: 400 });
    }

    // Paso 5: precios directos. prcventa nunca se recalcula desde costo/margen.
    const cur = existing[0];
    const curCosto = cur.costo != null ? Number(cur.costo) : null;
    const curPrcVenta = cur.prcventa != null ? Number(cur.prcventa) : null;
    const curPrecioMayor = cur.precio_mayor != null ? Number(cur.precio_mayor) : null;

    const finalPrcVenta = changes.prcventa !== undefined ? Number(changes.prcventa) : curPrcVenta;
    const finalPrecioMayor: number | null = changes.precio_mayor === undefined
      ? curPrecioMayor
      : (changes.precio_mayor === null ? null : Number(changes.precio_mayor));

    if (finalPrecioMayor !== null && finalPrcVenta !== null && finalPrecioMayor >= finalPrcVenta) {
      return NextResponse.json({ error: "Precio mayor debe ser menor al precio de venta" }, { status: 400 });
    }
    // Sin precio mayor no puede haber mínimo por cantidad.
    if (finalPrecioMayor === null && (changes.precio_mayor !== undefined || changes.minimo_mayor !== undefined)) {
      changes.minimo_mayor = null;
    }

    // El margen SIEMPRE se deriva de costo y prcventa finales (leyendo DB lo que no venga).
    if (changes.costo !== undefined || changes.prcventa !== undefined) {
      changes.margen_pct = calcularMargen(
        changes.costo !== undefined ? Number(changes.costo) : curCosto,
        finalPrcVenta,
      );
    }

    // S4: campos propagables que vienen del cliente
    const clientDetalle = changes.detalle;
    const clientImagenUrl = changes.imagen_url;
    const clientPrcVenta = changes.prcventa;

    // Paso 6: construir y ejecutar UPDATE + propagación en transacción atómica
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const key of Object.keys(changes)) {
      const col = WHITELIST[key];
      if (!col) continue;
      setClauses.push(`${col} = $${idx++}`);
      params.push(changes[key]);
    }
    setClauses.push(`updated_at = NOW()`);
    params.push(codigo);
    const query = `UPDATE public.productos SET ${setClauses.join(", ")} WHERE codigo = $${idx} RETURNING *`;

    // Transacción atómica: UPDATE + propagaciones en una sola transacción HTTP
    const queries = [sql.query(query, params)];

    // A) Propagar detalle a ubicaciones_bodega
    if (clientDetalle !== undefined) {
      queries.push(sql`
        UPDATE ubicaciones_bodega SET detalle = ${clientDetalle}, updated_at = NOW()
        WHERE codigo = ${codigo}
      `);
    }
    // B) Propagar a prenota_items (solo activas sin pagos)
    const prenotaChanges: string[] = [];
    const prenotaParams: unknown[] = [];
    let pIdx = 1;
    if (clientDetalle !== undefined) {
      prenotaChanges.push(`descripcion = $${pIdx++}`);
      prenotaParams.push(clientDetalle);
    }
    if (clientImagenUrl !== undefined) {
      prenotaChanges.push(`imagen_url = $${pIdx++}`);
      prenotaParams.push(clientImagenUrl);
    }
    const guard = `AND prenota_id IN (
            SELECT p.id FROM prenotas p
            WHERE p.estado = 'activa'
              AND NOT EXISTS (
                SELECT 1 FROM caja_movimiento_notas cmn WHERE cmn.prenota_id = p.id
              )
          )`;
    if (prenotaChanges.length > 0) {
      prenotaParams.push(codigo);
      queries.push(sql.query(`UPDATE prenota_items SET ${prenotaChanges.join(", ")}
        WHERE codigo = $${pIdx}
          ${guard}`, prenotaParams));
    }
    // prcventa solo a items 'detalle'; precio_mayor solo a items 'mayor'
    if (clientPrcVenta !== undefined) {
      queries.push(sql.query(`UPDATE prenota_items SET precio = $1
        WHERE codigo = $2 AND modalidad = 'detalle' ${guard}`, [clientPrcVenta, codigo]));
    }
    if (changes.precio_mayor != null) {
      queries.push(sql.query(`UPDATE prenota_items SET precio = $1
        WHERE codigo = $2 AND modalidad = 'mayor' ${guard}`, [changes.precio_mayor, codigo]));
    }

    const [productResult] = await sql.transaction(queries);
    return NextResponse.json({ data: productResult[0], message: "Producto actualizado" });

  } catch (error) {
    console.error("PUT /api/productos/[id] error:", error);
    const message = mensajeError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
