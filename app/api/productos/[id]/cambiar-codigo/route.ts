import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import type { UserSession } from "@/types";

// Endpoint dedicado: el codigo NO entra al WHITELIST del PUT /api/productos/[id]
// porque cambiarlo propaga a 4 tablas y exige unicidad por empresa.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as UserSession;
  if (user.rol !== "admin") {
    return NextResponse.json(
      { error: "Solo administradores pueden editar el código de un producto" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const pid = parseInt((await context.params).id, 10);

    if (typeof body?.codigo_nuevo !== "string") {
      return NextResponse.json({ error: "El código no puede estar vacío" }, { status: 400 });
    }
    const codigoNuevo = body.codigo_nuevo.trim();

    // Paso 1: access check + codigo actual
    const existing = await sql`SELECT empresa_id, codigo FROM productos WHERE id = ${pid}`;
    if (existing.length === 0)
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    const empresaId = existing[0].empresa_id;
    const codigoActual = existing[0].codigo;
    if (!user.empresas.includes(empresaId))
      return NextResponse.json({ error: "No tienes acceso a este producto" }, { status: 403 });

    // Paso 2: validaciones del codigo nuevo (post-trim)
    if (codigoNuevo === "")
      return NextResponse.json({ error: "El código no puede estar vacío" }, { status: 400 });
    if (codigoNuevo === codigoActual)
      return NextResponse.json({ error: "El código nuevo es igual al actual" }, { status: 400 });

    // Paso 3: unicidad dentro de la empresa
    const duplicado = await sql`
      SELECT id FROM productos
      WHERE empresa_id = ${empresaId} AND codigo = ${codigoNuevo}
      LIMIT 1
    `;
    if (duplicado.length > 0) {
      return NextResponse.json(
        { error: `Ya existe un producto con el código '${codigoNuevo}' en esta empresa` },
        { status: 409 }
      );
    }

    // Paso 4: propagacion atomica a las tablas que usan `codigo` como clave viva.
    // ingresos_mercaderia y conciliaciones_stock quedan fuera a proposito: son
    // bitacora historica y deben conservar el codigo tal como era en su momento.
    const [productResult] = await sql.transaction([
      sql.query(
        `UPDATE public.productos SET codigo = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [codigoNuevo, pid]
      ),
      sql.query(
        `UPDATE ubicaciones_bodega SET codigo = $1 WHERE codigo = $2 AND empresa_id = $3`,
        [codigoNuevo, codigoActual, empresaId]
      ),
      sql.query(
        `UPDATE catalogo_precio_override SET codigo = $1 WHERE codigo = $2`,
        [codigoNuevo, codigoActual]
      ),
      sql.query(
        `UPDATE prenota_items SET codigo = $1
         WHERE codigo = $2
           AND prenota_id IN (
             SELECT p.id FROM prenotas p
             WHERE p.estado = 'activa'
               AND NOT EXISTS (
                 SELECT 1 FROM caja_movimiento_notas cmn WHERE cmn.prenota_id = p.id
               )
           )`,
        [codigoNuevo, codigoActual]
      ),
    ]);

    return NextResponse.json({ data: productResult[0], message: "Código actualizado" });

  } catch (error) {
    console.error("POST /api/productos/[id]/cambiar-codigo error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
