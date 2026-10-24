import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { UserSession } from "@/types";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as UserSession).rol !== 'admin') {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    // Get all users
    const userRows = await sql`
      SELECT id, rut, nombre, rol, activo, created_at FROM usuarios ORDER BY nombre ASC
    `;

    // Map enterprise associations
    const empRows = await sql`SELECT usuario_id, empresa_id FROM usuario_empresa`;
    
    const mapped = userRows.map(u => ({
      ...u,
      empresas: empRows.filter(e => e.usuario_id === u.id).map(e => e.empresa_id)
    }));

    return NextResponse.json({ data: mapped });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as UserSession).rol !== 'admin') {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { rut, nombre, password, rol } = await request.json();

    if (!rut || !nombre || !password) {
      return NextResponse.json({ error: "Faltan datos obligatorios" }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 10);

    // Insert User
    const inserted = await sql`
      INSERT INTO usuarios (rut, nombre, password, rol)
      VALUES (${rut}, ${nombre}, ${hashed}, ${rol || 'vendedor'})
      RETURNING id, rut, nombre, rol, activo
    `;

    const userId = inserted[0].id;

    // Insert Empresas — single tenant: siempre empresa_id = 1
    await sql`INSERT INTO usuario_empresa (usuario_id, empresa_id) VALUES (${userId}, 1)`;

    return NextResponse.json({ data: { ...inserted[0], empresas: [1] } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('unique constraint')) {
      return NextResponse.json({ error: "El RUT ya está registrado" }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
