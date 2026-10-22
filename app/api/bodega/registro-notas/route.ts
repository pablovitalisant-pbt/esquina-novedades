import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const folio = searchParams.get('folio')?.trim() || null;
  const fecha = searchParams.get('fecha')?.trim() || null;

  const rows = await sql`
    SELECT
      r.id,
      r.folio,
      r.empresa_id,
      r.usuario_id,
      r.usuario_nombre,
      r.observacion,
      r.created_at
    FROM public.registro_notas_bodega r
    WHERE
      (${folio}::text IS NULL OR r.folio ILIKE ${'%' + (folio || '') + '%'})
      AND (${fecha}::date IS NULL OR r.created_at::date = ${fecha}::date)
    ORDER BY r.created_at DESC
    LIMIT 200
  `;

  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const userId = Number((session.user as any).id);
  const usuarioNombre = (session.user as any).nombre as string;

  const body = await req.json();
  const folio = body?.folio?.trim();
  const empresaId = Number(body?.empresa_id);
  const observacion = body?.observacion?.trim() || null;

  if (!folio) return NextResponse.json({ error: 'folio requerido' }, { status: 400 });
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 });

  const rows = await sql`
    INSERT INTO public.registro_notas_bodega
      (folio, empresa_id, usuario_id, usuario_nombre, observacion)
    VALUES
      (${folio}, ${empresaId}, ${userId}, ${usuarioNombre}, ${observacion})
    RETURNING *
  `;

  return NextResponse.json((rows as any)[0], { status: 201 });
}
