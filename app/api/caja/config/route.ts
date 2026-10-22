import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { CajaConfigSchema } from "@/docs/specs/caja-mayor.spec";

function authGuard(session: any) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return null;
}

function adminGuard(session: any) {
  const guard = authGuard(session);
  if (guard) return guard;
  if ((session.user as any).rol !== "admin") {
    return NextResponse.json({ error: "Acceso denegado — solo admin" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const guard = authGuard(session);
  if (guard) return guard;

  try {
    const rows = await sql`
      SELECT clave, valor, updated_at::text, updated_por
      FROM caja_config
      WHERE clave = 'dolar_dia'
    `;
    const config = rows[0] ?? { clave: "dolar_dia", valor: "0", updated_at: null, updated_por: "system" };
    return NextResponse.json({ data: config });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const guard = adminGuard(session);
  if (guard) return guard;

  try {
    const body = await request.json();
    const parsed = CajaConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { dolar_dia } = parsed.data;
    const updatedPor = (session!.user as any).nombre as string;

    const rows = await sql`
      INSERT INTO caja_config (clave, valor, updated_por, updated_at)
      VALUES ('dolar_dia', ${String(dolar_dia)}, ${updatedPor}, now())
      ON CONFLICT (clave) DO UPDATE SET
        valor = EXCLUDED.valor,
        updated_por = EXCLUDED.updated_por,
        updated_at = now()
      RETURNING clave, valor, updated_at::text, updated_por
    `;

    return NextResponse.json({ data: rows[0] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
