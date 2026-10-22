import { sql } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// POST: lo llama el código (el dispositivo que reporta el conflicto al
// recuperar conexión) → cualquier usuario autenticado, no solo admin.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tabla, operacion, entidad_id, payload, http_status, error_mensaje } = body || {};

    // Validación defensiva (no viene de un formulario, pero simple y clara)
    if (!tabla || typeof tabla !== 'string') {
      return NextResponse.json({ error: 'tabla es requerida' }, { status: 400 });
    }
    if (!operacion || typeof operacion !== 'string') {
      return NextResponse.json({ error: 'operacion es requerida' }, { status: 400 });
    }
    if (payload === undefined || payload === null) {
      return NextResponse.json({ error: 'payload es requerido' }, { status: 400 });
    }

    // Validar que payload sea JSON serializable antes del INSERT (evitar que
    // un objeto circular o no serializable rompa la ruta con un 500 feo).
    let payloadJson: string;
    try {
      payloadJson = JSON.stringify(payload);
    } catch {
      return NextResponse.json({ error: 'payload inválido: no es JSON serializable' }, { status: 400 });
    }
    const payloadParsed = JSON.parse(payloadJson);

    const user = session.user as any;
    const rows = await sql`
      INSERT INTO sync_conflictos (tabla, operacion, entidad_id, payload, http_status, error_mensaje, usuario_id, usuario_nombre, estado)
      VALUES (${tabla}, ${operacion}, ${entidad_id ?? null}, ${payloadParsed}, ${http_status ?? null}, ${error_mensaje ?? null}, ${user.id ?? null}, ${user.nombre ?? null}, 'pendiente')
      RETURNING id, tabla, operacion, entidad_id, http_status, error_mensaje, usuario_id, usuario_nombre, estado, created_at
    `;

    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/sync-conflictos error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET: admin-only. Filtro opcional ?estado=pendiente|resuelto (default pendiente).
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if ((session.user as any).rol !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado') === 'resuelto' ? 'resuelto' : 'pendiente';

    const rows = await sql`
      SELECT id, tabla, operacion, entidad_id, payload, http_status, error_mensaje,
             usuario_id, usuario_nombre, estado, resuelto_en, resuelto_por,
             resuelto_por_nombre, accion_tomada, created_at
      FROM sync_conflictos
      WHERE estado = ${estado}
      ORDER BY created_at DESC
    `;

    return NextResponse.json({ data: rows });
  } catch (error: any) {
    console.error('GET /api/sync-conflictos error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
