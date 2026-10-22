import { sql } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// PATCH: admin-only. Única acción del MVP: { accion: 'descartar' }.
// Idempotente: si ya estaba resuelto → 409 (evita doble clic con dos
// resultados distintos).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if ((session.user as any).rol !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { accion } = body || {};

    // Validar acción: 'descartar' es la única válida en este MVP. Rechazar
    // cualquier otro valor (deja puerta abierta a 'reintentar'/'editar' en el
    // futuro sin romper el contrato).
    if (accion !== 'descartar') {
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
    }

    const user = session.user as any;
    const rows = await sql`
      UPDATE sync_conflictos
      SET estado = 'resuelto',
          accion_tomada = 'descartado',
          resuelto_en = NOW(),
          resuelto_por = ${user.id ?? null},
          resuelto_por_nombre = ${user.nombre ?? null}
      WHERE id = ${Number(id)} AND estado = 'pendiente'
      RETURNING id
    `;

    if (rows.length === 0) {
      // No se actualizó: o no existe, o ya estaba resuelto.
      const existing = await sql`
        SELECT id, estado FROM sync_conflictos WHERE id = ${Number(id)}
      `;
      if (existing.length === 0) {
        return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Ya resuelto' }, { status: 409 });
    }

    return NextResponse.json({ data: { id: Number(id), estado: 'resuelto', accion_tomada: 'descartado' } });
  } catch (error: any) {
    console.error('PATCH /api/sync-conflictos/[id] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
