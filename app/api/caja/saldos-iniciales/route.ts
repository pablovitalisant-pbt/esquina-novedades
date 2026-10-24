import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { CajaSaldoInicialSchema } from "@/docs/specs/caja-mayor.spec";
import { mensajeError } from '@/lib/errores';

interface SaldoInicialRow {
  id: number;
  cuenta_id: number;
  cuenta_nombre: string;
  fecha: string;
  saldo: string;
  observaciones: string | null;
  created_at: string;
}


function adminGuard(session: Session | null) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = session.user.rol;
  if (rol !== "admin") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const g = adminGuard(session);
  if (g) return g;

  try {
    const rows = await sql`
      SELECT si.id, si.cuenta_id, cc.nombre AS cuenta_nombre,
        si.fecha::text, si.saldo, si.observaciones,
        si.created_at::text
      FROM caja_saldos_iniciales si
      JOIN caja_cuentas cc ON cc.id = si.cuenta_id
      ORDER BY cc.orden ASC
    `;

    const data = (rows as SaldoInicialRow[]).map((r) => ({
      id: r.id,
      cuenta_id: r.cuenta_id,
      cuenta_nombre: r.cuenta_nombre,
      fecha: r.fecha,
      saldo: parseFloat(r.saldo),
      observaciones: r.observaciones,
      created_at: r.created_at,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const g = adminGuard(session);
  if (g) return g;

  try {
    const body = await request.json();
    const parsed = CajaSaldoInicialSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { cuenta_id, fecha, saldo, observaciones } = parsed.data;
    const creadoPor = session!.user.nombre;

    // UPSERT: solo un saldo inicial por cuenta
    const rows = await sql`
      INSERT INTO caja_saldos_iniciales (cuenta_id, fecha, saldo, observaciones, creado_por)
      VALUES (${cuenta_id}, ${fecha}::date, ${saldo}, ${observaciones ?? null}, ${creadoPor})
      ON CONFLICT (cuenta_id)
      DO UPDATE SET fecha = EXCLUDED.fecha, saldo = EXCLUDED.saldo,
        observaciones = EXCLUDED.observaciones
      RETURNING id, cuenta_id, fecha::text, saldo, observaciones, creado_por, created_at::text
    `;

    // Fetch cuenta name
    const cuentaRows = await sql`
      SELECT nombre FROM caja_cuentas WHERE id = ${cuenta_id}
    `;

    const result = {
      id: rows[0].id,
      cuenta_id: rows[0].cuenta_id,
      cuenta_nombre: cuentaRows[0]?.nombre || "",
      fecha: rows[0].fecha,
      saldo: parseFloat(rows[0].saldo),
      observaciones: rows[0].observaciones,
      created_at: rows[0].created_at,
    };

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}
