import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

// PUT /api/catalogos/[id] — editar catálogo (admin o dueño)
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  // bodeguero no accede a catálogo admin (ni aunque sea dueño del catálogo)
  if ((session.user as any).rol === 'bodeguero') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  const catalogoId = Number((await params).id);
  const user = session.user as any;
  const userId = Number(user.id);
  const isAdmin = user.rol === 'admin';

  // Verificar que el catálogo existe y el usuario tiene permiso
  const cats = await sql`SELECT * FROM catalogos WHERE id = ${catalogoId}`;
  if (cats.length === 0) {
    return NextResponse.json({ error: 'Catálogo no encontrado' }, { status: 404 });
  }
  const cat = cats[0];

  const isOwner = cat.user_id === userId;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await req.json();
  const { palabras_excluir, margen_precio, precio_overrides } = body;

  // Actualizar campos del catálogo
  if (palabras_excluir !== undefined || margen_precio !== undefined) {
    await sql`
      UPDATE catalogos
      SET
        palabras_excluir = ${palabras_excluir !== undefined ? String(palabras_excluir) : cat.palabras_excluir},
        margen_precio = ${margen_precio !== undefined ? Number(margen_precio) : cat.margen_precio},
        updated_at = NOW()
      WHERE id = ${catalogoId}
    `;
  }

  // Gestionar precio_overrides
  if (precio_overrides !== undefined) {
    // Validar
    for (const po of precio_overrides) {
      if (!po.codigo || po.codigo.trim() === '') {
        return NextResponse.json({ error: 'codigo no puede estar vacío' }, { status: 400 });
      }
      if (po.precio !== null && (typeof po.precio !== 'number' || po.precio <= 0)) {
        return NextResponse.json({ error: 'precio debe ser > 0' }, { status: 400 });
      }
    }

    // Transacción: DELETE + INSERT
    await sql`DELETE FROM catalogo_precio_override WHERE catalogo_id = ${catalogoId}`;

    const inserts = precio_overrides
      .filter((po: any) => po.precio !== null)
      .map((po: any) => ({
        catalogoId,
        codigo: po.codigo.trim(),
        precio: po.precio,
      }));

    // ponytail: INSERTs individuales — multi-row con sql.unsafe requiere armar el
    // string con valores interpolados manualmente. Para el volumen de overrides
    // esperado (< 100 por request), N queries individuales no son problema.
    // Si escala, batch INSERT con unnest() sería el upgrade path.
    for (const p of inserts) {
      await sql`
        INSERT INTO catalogo_precio_override (catalogo_id, codigo, precio)
        VALUES (${p.catalogoId}, ${p.codigo}, ${p.precio})
        ON CONFLICT (catalogo_id, codigo) DO UPDATE SET precio = EXCLUDED.precio
      `;
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/catalogos/[id] — eliminar catálogo (admin o dueño)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  // bodeguero no accede a catálogo admin (ni aunque sea dueño del catálogo)
  if ((session.user as any).rol === 'bodeguero') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  const catalogoId = Number((await params).id);
  const user = session.user as any;
  const userId = Number(user.id);
  const isAdmin = user.rol === 'admin';

  const cats = await sql`SELECT user_id FROM catalogos WHERE id = ${catalogoId}`;
  if (cats.length === 0) {
    return NextResponse.json({ error: 'Catálogo no encontrado' }, { status: 404 });
  }

  const isOwner = cats[0].user_id === userId;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  // catalogo_precio_override y catalogo_items tienen ON DELETE CASCADE
  await sql`DELETE FROM catalogos WHERE id = ${catalogoId}`;

  return NextResponse.json({ ok: true });
}
