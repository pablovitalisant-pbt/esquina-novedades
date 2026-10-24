import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import type { SessionUser } from "../../_types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = (session.user as SessionUser).rol;
  if (rol !== "admin") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const id = parseInt((await params).id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { fecha_desde, fecha_hasta } = body as {
      fecha_desde?: string;
      fecha_hasta?: string;
    };

    if (!fecha_desde && !fecha_hasta) {
      return NextResponse.json(
        { error: "Debe especificar al menos fecha_desde o fecha_hasta" },
        { status: 400 }
      );
    }

    const current = await sql`
      SELECT id FROM caja_cierres WHERE id = ${id}
    `;
    if (current.length === 0) {
      return NextResponse.json({ error: "Cierre no encontrado" }, { status: 404 });
    }

    const updated = await sql`
      UPDATE caja_cierres
      SET fecha_desde = COALESCE(${fecha_desde ?? null}::date, fecha_desde),
          fecha_hasta = COALESCE(${fecha_hasta ?? null}::date, fecha_hasta)
      WHERE id = ${id}
      RETURNING id, fecha_desde::text, fecha_hasta::text, resumen,
        usuario_id, usuario_nombre, created_at::text
    `;

    const row = updated[0];
    return NextResponse.json({
      data: {
        id: row.id,
        fecha_desde: row.fecha_desde,
        fecha_hasta: row.fecha_hasta,
        resumen: typeof row.resumen === "string" ? JSON.parse(row.resumen) : row.resumen,
        usuario_id: row.usuario_id,
        usuario_nombre: row.usuario_nombre,
        created_at: row.created_at,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = (session.user as SessionUser).rol;
  if (rol !== "admin") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const id = parseInt((await params).id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    const rows = await sql`
      DELETE FROM caja_cierres WHERE id = ${id} RETURNING id
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Cierre no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ data: { id: rows[0].id, eliminado: true } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
