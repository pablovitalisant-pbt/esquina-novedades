import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import type { UserSession } from "@/types";

// Soft-delete: marca activo = false. No hay DELETE fisico (FKs RESTRICT desde
// catalogo_items/pedido_items) ni propagacion a otras tablas — el `codigo` no
// cambia, solo se oculta el producto de listados y busquedas.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as UserSession;
  if (user.rol !== "admin") {
    return NextResponse.json(
      { error: "Solo administradores pueden eliminar un producto" },
      { status: 403 }
    );
  }

  try {
    const pid = parseInt((await context.params).id, 10);

    // Paso 1: access check + estado actual
    const existing = await sql`SELECT empresa_id, saldo, activo FROM productos WHERE id = ${pid}`;
    if (existing.length === 0)
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    const { empresa_id: empresaId, saldo, activo } = existing[0];
    if (!user.empresas.includes(empresaId))
      return NextResponse.json({ error: "No tienes acceso a este producto" }, { status: 403 });

    // Paso 2: ya eliminado. Va antes que el chequeo de stock a proposito:
    // reintentar sobre algo ya borrado es un error de estado, no de stock.
    if (activo === false)
      return NextResponse.json({ error: "Este producto ya fue eliminado" }, { status: 400 });

    // Paso 3: no se elimina con stock vivo (saldo negativo = descuadre, no bloquea)
    if (Number(saldo) > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: el producto tiene stock (saldo: ${saldo} unidades)` },
        { status: 409 }
      );
    }

    const [productResult] = await sql`
      UPDATE productos SET activo = false, updated_at = NOW()
      WHERE id = ${pid} RETURNING *
    `;

    return NextResponse.json({ data: productResult, message: "Producto eliminado" });

  } catch (error) {
    console.error("POST /api/productos/[id]/eliminar error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
