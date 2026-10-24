import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { CajaCuentaCreateSchema } from "@/docs/specs/caja-mayor.spec";
import { requiereAdmin } from "../_types";
import { mensajeError } from '@/lib/errores';


export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const soloActivas = searchParams.get("activas") === "true";

    let rows;
    if (soloActivas) {
      rows = await sql`
        SELECT id, nombre, moneda, activa, orden, created_at::text
        FROM caja_cuentas
        WHERE activa = true
        ORDER BY orden ASC, id ASC
      `;
    } else {
      rows = await sql`
        SELECT id, nombre, moneda, activa, orden, created_at::text
        FROM caja_cuentas
        ORDER BY orden ASC, id ASC
      `;
    }

    return NextResponse.json({ data: rows });
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const guard = requiereAdmin(session, "Acceso denegado — solo admin");
  if (guard) return guard;

  try {
    const body = await request.json();
    const parsed = CajaCuentaCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { nombre, orden, activa } = parsed.data;

    const rows = await sql`
      INSERT INTO caja_cuentas (nombre, moneda, orden, activa)
      VALUES (${nombre}, 'CLP', ${orden}, ${activa})
      RETURNING id, nombre, moneda, activa, orden, created_at::text
    `;

    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}
