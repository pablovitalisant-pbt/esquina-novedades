import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requiereAdmin } from "../_types";
import { mensajeError } from '@/lib/errores';

// Única clave expuesta: cuenta que recibe los cobros de Mercado Pago.
const PatchSchema = z.object({ mp_cuenta_id: z.number().int().positive() }).strict();

async function adminGuard() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return requiereAdmin(session, "Acceso denegado — solo admin") ?? session;
}

export async function GET() {
  const guard = await adminGuard();
  if (guard instanceof NextResponse) return guard;
  try {
    const [row] = await sql`SELECT valor FROM public.caja_config WHERE clave = 'mp_cuenta_id'`;
    const id = Number(row?.valor);
    return NextResponse.json({ data: { mp_cuenta_id: Number.isInteger(id) && id > 0 ? id : null } });
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const guard = await adminGuard();
  if (guard instanceof NextResponse) return guard;
  try {
    const parsed = PatchSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const { mp_cuenta_id } = parsed.data;

    const [cuenta] = await sql`
      SELECT id FROM public.caja_cuentas WHERE id = ${mp_cuenta_id} AND activa = true
    `;
    if (!cuenta) return NextResponse.json({ error: "La cuenta no existe o está inactiva" }, { status: 400 });

    await sql`
      INSERT INTO public.caja_config (clave, valor, updated_at, updated_por)
      VALUES ('mp_cuenta_id', ${String(mp_cuenta_id)}, NOW(), ${guard.user.nombre ?? null})
      ON CONFLICT (clave) DO UPDATE
        SET valor = EXCLUDED.valor, updated_at = NOW(), updated_por = EXCLUDED.updated_por
    `;
    return NextResponse.json({ data: { mp_cuenta_id } });
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}
