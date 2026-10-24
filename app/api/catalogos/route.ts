import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/catalogos?empresa=1 — listar catálogos de la empresa
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (session.user.rol === 'bodeguero') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const empresaId = searchParams.get('empresa') || '1';

  const rows = await sql`
    SELECT * FROM catalogos
    WHERE empresa_id = ${Number(empresaId)}
    ORDER BY created_at DESC
  `;

  return NextResponse.json({ data: rows });
}

// POST /api/catalogos — crear nuevo catálogo
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (session.user.rol === 'bodeguero') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  const body = await req.json();
  const { empresaId, titulo, descripcion, mostrar_precio, margen_precio,
    solo_stock, mostrar_stock, solo_nuevo, solo_nuevo_top_n,
    palabras_incluir, palabras_excluir, categoria } = body;

  if (!titulo || !titulo.trim()) {
    return NextResponse.json({ error: 'El título es requerido' }, { status: 400 });
  }

  // Generar slug desde el título
  let slug = titulo
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Si el slug ya existe, agregar sufijo numérico
  const existing = await sql`SELECT id FROM catalogos WHERE slug = ${slug}`;
  if (existing.length > 0) {
    let suffix = 1;
    while (true) {
      const candidate = `${slug}-${suffix}`;
      const check = await sql`SELECT id FROM catalogos WHERE slug = ${candidate}`;
      if (check.length === 0) {
        slug = candidate;
        break;
      }
      suffix++;
    }
  }

  const userId = Number(session.user.id);

  const result = await sql`
    INSERT INTO catalogos (
      empresa_id, user_id, titulo, slug, descripcion, activo,
      mostrar_precio, margen_precio, solo_stock, mostrar_stock,
      solo_nuevo, solo_nuevo_top_n, palabras_incluir, palabras_excluir, categoria
    ) VALUES (
      ${Number(empresaId) || 1}, ${userId}, ${titulo.trim()}, ${slug},
      ${descripcion ?? null}, true,
      ${mostrar_precio ?? true}, ${margen_precio ?? 0},
      ${solo_stock ?? true}, ${mostrar_stock ?? false},
      ${solo_nuevo ?? false}, ${solo_nuevo_top_n ?? 1},
      ${palabras_incluir ?? ''}, ${palabras_excluir ?? ''},
      ${categoria ?? null}
    )
    RETURNING *
  `;

  return NextResponse.json(result[0], { status: 201 });
}
