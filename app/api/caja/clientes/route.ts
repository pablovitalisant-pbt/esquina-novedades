import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import type { SessionUser } from "../_types";

interface ClienteBusquedaRow {
  cliente_id: string;
  nombre: string;
  total_compras: number;
  ultima_compra: string;
}

function guard(session: Session | null) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = (session.user as SessionUser).rol;
  if (rol !== "admin") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const g = guard(session);
  if (g) return g;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";

  if (q.length < 2) {
    return NextResponse.json({ error: "Mínimo 2 caracteres para buscar" }, { status: 400 });
  }

  try {
    // ponytail: Slice 19 — fix: cliente_id en vez de usuario_id (BUG-001).
    // INNER JOIN: solo clientes con FK asignada (notas legacy con NULL excluidas).
    const pattern = `%${q}%`;

    const rows = await sql`
      SELECT
        p.cliente_id,
        c.nombre,
        COUNT(*)::int AS total_compras,
        MAX(p.created_at)::text AS ultima_compra
      FROM public.prenotas p
      JOIN public.clientes c ON c.id = p.cliente_id
      WHERE (c.nombre ILIKE ${pattern} OR p.titulo ILIKE ${pattern})
      GROUP BY p.cliente_id, c.nombre
      ORDER BY ultima_compra DESC
      LIMIT 15
    `;

    const result = (rows as ClienteBusquedaRow[]).map((r) => ({
      cliente_id: r.cliente_id,
      nombre: r.nombre,
      total_compras: r.total_compras,
      ultima_compra: r.ultima_compra,
    }));

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
