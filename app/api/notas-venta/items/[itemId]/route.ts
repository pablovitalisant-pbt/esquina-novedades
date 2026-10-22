import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sql } from '@/lib/db';
import { authOptions } from '@/lib/auth';

import type { RouteContext } from '@/types';

async function validarSesion() {
  const session = await getServerSession(authOptions);
  const rol = (session?.user as any)?.rol;

  if (!session) {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }

  if (rol === 'bodeguero') {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
  }

  return { session };
}

// BUG-052: DELETE de ítem offline. La ruta NO lleva [id] de nota a propósito:
// al eliminar offline la fila ya no existe localmente, así que el cliente no
// puede proveer el prenota_id — el server lo resuelve desde Postgres.
export async function DELETE(_request: NextRequest, { params }: RouteContext<{ itemId: string }>) {
  const auth = await validarSesion();
  if (auth.error) return auth.error;

  // itemId es UUID (string), no SERIAL (ver migración 027_prenota_items_uuid.sql).
  const itemId = (await params).itemId;

  // Resolver la nota a la que pertenece el ítem. Si el ítem no existe en
  // Postgres, no hay stock que restaurar → 404 (el cliente lo trata como
  // convergencia/éxito, no reintenta).
  const itemRows = await sql`
    SELECT prenota_id FROM public.prenota_items WHERE id = ${itemId}
  `;
  if (itemRows.length === 0) {
    return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 });
  }
  const notaId = Number(itemRows[0].prenota_id);

  try {
    // Misma transacción atómica que [id]/items/[itemId]/route.ts (DELETE):
    // 1) FOR UPDATE sobre prenotas serializa con anulación/reembolso concurrentes
    //    (anti doble-restore).
    // 2) Guard 1/COUNT aborta (22012) si la nota no está activa o el ítem ya no existe.
    // 3) El stock se restaura DESDE el ítem bajo el lock (subquery).
    await sql.transaction([
      sql`SELECT id FROM public.prenotas WHERE id = ${notaId} FOR UPDATE`,
      sql`SELECT 1 / (SELECT COUNT(*)::int FROM public.prenotas
            WHERE id = ${notaId} AND estado = 'activa'
            AND EXISTS (SELECT 1 FROM public.prenota_items WHERE id = ${itemId})) AS guard`,
      sql`UPDATE public.productos p SET saldo = p.saldo + it.unidades
          FROM (SELECT unidades, codigo, empresa_id FROM public.prenota_items WHERE id = ${itemId}) it
          WHERE p.codigo = it.codigo AND p.empresa_id = it.empresa_id`,
      sql`UPDATE public.ubicaciones_bodega u SET saldo = u.saldo + it.unidades, updated_at = NOW()
          FROM (SELECT unidades, codigo, empresa_id FROM public.prenota_items WHERE id = ${itemId}) it
          WHERE u.codigo = it.codigo AND u.empresa_id = it.empresa_id`,
      sql`DELETE FROM public.prenota_items WHERE id = ${itemId}`,
    ]);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    // El guard detectó una condición inválida → distinguir la causa.
    if (String(error.code) === '22012') {
      const notaRows = await sql`
        SELECT estado FROM public.prenotas WHERE id = ${notaId}
      `;
      if (notaRows.length === 0) {
        return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
      }
      if (notaRows[0].estado !== 'activa') {
        return NextResponse.json({ error: 'No se puede modificar una nota anulada' }, { status: 422 });
      }
      return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 });
    }
    console.error('DELETE item error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
