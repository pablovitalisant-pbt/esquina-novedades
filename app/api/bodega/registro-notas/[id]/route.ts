import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

import type { RouteContext } from '@/types';

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const rol = (session.user as any)?.rol;
  if (rol !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 });

  const id = Number((await params).id);
  const userId = String((session.user as any).id);
  const usuarioNombre = (session.user as any).nombre as string;

  let observacionEliminacion: string | null = null;
  try {
    const body = await req.json();
    observacionEliminacion = body?.observacion?.trim() || null;
  } catch {
    // body opcional
  }

  // Leer registro antes de eliminar
  const registroRows = await sql`
    SELECT * FROM public.registro_notas_bodega WHERE id = ${id}
  `;
  const registro = (registroRows as any)[0] || null;

  // Insertar en auditoría
  await sql`
    INSERT INTO public.app_audit_log
      (id, "actorUserId", action, entity, "entityId", diff, "createdAt")
    VALUES (
      gen_random_uuid()::text,
      ${userId},
      'DELETE_REGISTRO_NOTA',
      'registro_notas_bodega',
      ${String(id)},
      ${JSON.stringify({
        registro_eliminado: registro,
        eliminado_por_nombre: usuarioNombre,
        observacion_eliminacion: observacionEliminacion,
      })}::jsonb,
      now()
    )
  `;

  await sql`DELETE FROM public.registro_notas_bodega WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
