import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { CajaCuentaUpdateSchema } from "@/docs/specs/caja-mayor.spec";

function adminGuard(session: any) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if ((session.user as any).rol !== "admin") {
    return NextResponse.json({ error: "Acceso denegado — solo admin" }, { status: 403 });
  }
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const guard = adminGuard(session);
  if (guard) return guard;

  try {
    const id = parseInt((await params).id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = CajaCuentaUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    // Check cuenta exists
    const existing = await sql`SELECT id FROM caja_cuentas WHERE id = ${id}`;
    if (existing.length === 0) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const { nombre, orden, activa } = parsed.data;

    const rows = await sql`
      UPDATE caja_cuentas
      SET nombre = COALESCE(${nombre ?? null}, nombre),
          orden = COALESCE(${orden ?? null}, orden),
          activa = COALESCE(${activa ?? null}, activa)
      WHERE id = ${id}
      RETURNING id, nombre, moneda, activa, orden, created_at::text
    `;

    return NextResponse.json({ data: rows[0] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const guard = adminGuard(session);
  if (guard) return guard;

  try {
    const id = parseInt((await params).id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    // Check cuenta exists
    const existing = await sql`SELECT id FROM caja_cuentas WHERE id = ${id}`;
    if (existing.length === 0) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    // R4: No desactivar si tiene movimientos asociados
    const movs = await sql`
      SELECT COUNT(*)::int AS total
      FROM caja_movimientos
      WHERE cuenta_id = ${id}
    `;
    if (movs[0].total > 0) {
      return NextResponse.json(
        { error: "No se puede desactivar una cuenta con movimientos registrados" },
        { status: 409 }
      );
    }

    // Soft delete
    const rows = await sql`
      UPDATE caja_cuentas SET activa = false
      WHERE id = ${id}
      RETURNING id, nombre, moneda, activa, orden, created_at::text
    `;

    return NextResponse.json({ data: rows[0] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
