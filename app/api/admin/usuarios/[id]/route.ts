import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).rol !== 'admin') {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const uid = parseInt(id, 10);

  try {
    const { rut, nombre, password, rol, activo } = await request.json();

    // Prevent removing admin from self
    if ((session.user as any).id === uid && (rol !== 'admin' || activo === false)) {
      return NextResponse.json({ error: "No puedes quitarte los permisos de admin a ti mismo" }, { status: 400 });
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    // Use sequential conditional updates instead of dynamic string building
    if (rut !== undefined) await sql`UPDATE usuarios SET rut = ${rut} WHERE id = ${uid}`;
    if (nombre !== undefined) await sql`UPDATE usuarios SET nombre = ${nombre} WHERE id = ${uid}`;
    if (rol !== undefined) await sql`UPDATE usuarios SET rol = ${rol} WHERE id = ${uid}`;
    if (activo !== undefined) await sql`UPDATE usuarios SET activo = ${activo} WHERE id = ${uid}`;
    if (hashedPassword) await sql`UPDATE usuarios SET password = ${hashedPassword} WHERE id = ${uid}`;
    await sql`UPDATE usuarios SET updated_at = NOW() WHERE id = ${uid}`;

    // Single tenant: siempre empresa_id = 1
    await sql`DELETE FROM usuario_empresa WHERE usuario_id = ${uid}`;
    await sql`INSERT INTO usuario_empresa (usuario_id, empresa_id) VALUES (${uid}, 1)`;

    return NextResponse.json({ message: "Usuario actualizado" });
  } catch (error: any) {
    if (error.message && error.message.includes('unique constraint')) {
      return NextResponse.json({ error: "El RUT modificado ya pertenece a otro usuario" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).rol !== 'admin') {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const uid = parseInt(id, 10);

  if ((session.user as any).id === uid) {
    return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400 });
  }

  try {
    await sql`DELETE FROM usuario_empresa WHERE usuario_id = ${uid}`;
    await sql`DELETE FROM usuarios WHERE id = ${uid}`;
    return NextResponse.json({ message: "Usuario eliminado" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
