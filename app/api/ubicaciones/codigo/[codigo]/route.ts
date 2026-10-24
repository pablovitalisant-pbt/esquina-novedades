import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { mensajeError } from '@/lib/errores';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ codigo: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user;
  const empresaId = user.empresas?.[0];
  if (!empresaId) return NextResponse.json({ error: "Sin empresa asignada" }, { status: 400 });

  try {
    const { codigo } = await params;
    const body = await request.json();
    const { ubicacion, fisico_cajas, fisico_unidades, observaciones } = body;

    // Validar que el producto existe antes de upsert
    const product = await sql`
      SELECT id, saldo, cantcaja FROM productos
      WHERE codigo = ${codigo} AND empresa_id = ${empresaId}
    `;
    if (product.length === 0) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 400 });
    }

    const saldo = product[0].saldo;
    const cantcaja = product[0].cantcaja || 1;

    // Calcular fisico y diferencia
    let fisicoTotal: number | null = null;
    let diferencia: number | null = null;
    const cajas = fisico_cajas !== undefined && fisico_cajas !== null ? parseInt(fisico_cajas) : null;
    const unidades = fisico_unidades !== undefined && fisico_unidades !== null ? parseInt(fisico_unidades) : 0;

    if (cajas !== null) {
      fisicoTotal = (cajas * cantcaja) + unidades;
      diferencia = fisicoTotal - saldo;
    }

    // Upsert: INSERT ... ON CONFLICT (empresa_id, codigo) DO UPDATE
    const updated = await sql`
      INSERT INTO ubicaciones_bodega (empresa_id, codigo, ubicacion, saldo, cantcaja, fisico, fisico_cajas, fisico_unidades, diferencia, observaciones, updated_at)
      VALUES (${empresaId}, ${codigo}, ${ubicacion || ''}, ${saldo}, ${cantcaja}, ${fisicoTotal}, ${cajas}, ${unidades}, ${diferencia}, ${observaciones || null}, NOW())
      ON CONFLICT (empresa_id, codigo) DO UPDATE SET
        ubicacion = EXCLUDED.ubicacion,
        fisico = EXCLUDED.fisico,
        fisico_cajas = EXCLUDED.fisico_cajas,
        fisico_unidades = EXCLUDED.fisico_unidades,
        diferencia = EXCLUDED.diferencia,
        observaciones = EXCLUDED.observaciones,
        updated_at = NOW()
      RETURNING id, codigo, ubicacion, fisico, fisico_cajas, fisico_unidades, diferencia, observaciones, saldo
    `;

    return NextResponse.json({ data: updated[0] });

  } catch (error) {
    console.error("PUT /api/ubicaciones/codigo/[codigo] error:", error);
    const message = mensajeError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
