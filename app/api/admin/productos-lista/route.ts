import { sql } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { mensajeError } from '@/lib/errores';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);
    const offset = Number(searchParams.get('offset')) || 0;
    const search = searchParams.get('search')?.trim() || '';
    const sinCategoria = searchParams.get('sinCategoria') === 'true';
    const categoriaFiltro = searchParams.get('categoriaFiltro') ?? null;
    const hasSearch = search.length > 0;
    const sp = `%${search}%`;

    let rows;
    let countRows;

    if (categoriaFiltro && categoriaFiltro !== '__sin__') {
      if (hasSearch) {
        rows = await sql`
          SELECT DISTINCT ON (p.codigo)
            p.id, p.codigo, p.detalle, p.imagen_url, p.categoria
          FROM public.productos p
          WHERE (p.codigo ILIKE ${sp} OR p.detalle ILIKE ${sp})
            AND p.categoria = ${categoriaFiltro}
            AND p.activo = true
          ORDER BY p.codigo ASC
          LIMIT ${limit} OFFSET ${offset}
        `;
        countRows = await sql`
          SELECT COUNT(DISTINCT p.codigo)::int as total
          FROM public.productos p
          WHERE (p.codigo ILIKE ${sp} OR p.detalle ILIKE ${sp})
            AND p.categoria = ${categoriaFiltro}
            AND p.activo = true
        `;
      } else {
        rows = await sql`
          SELECT DISTINCT ON (p.codigo)
            p.id, p.codigo, p.detalle, p.imagen_url, p.categoria
          FROM public.productos p
          WHERE p.categoria = ${categoriaFiltro}
            AND p.activo = true
          ORDER BY p.codigo ASC
          LIMIT ${limit} OFFSET ${offset}
        `;
        countRows = await sql`
          SELECT COUNT(DISTINCT p.codigo)::int as total
          FROM public.productos p
          WHERE p.categoria = ${categoriaFiltro}
            AND p.activo = true
        `;
      }
    } else if (categoriaFiltro === '__sin__' || sinCategoria) {
      if (hasSearch) {
        rows = await sql`
          SELECT DISTINCT ON (p.codigo)
            p.id, p.codigo, p.detalle, p.imagen_url, p.categoria
          FROM public.productos p
          WHERE (p.codigo ILIKE ${sp} OR p.detalle ILIKE ${sp})
            AND p.categoria IS NULL
            AND p.activo = true
          ORDER BY p.codigo ASC
          LIMIT ${limit} OFFSET ${offset}
        `;
        countRows = await sql`
          SELECT COUNT(DISTINCT p.codigo)::int as total
          FROM public.productos p
          WHERE (p.codigo ILIKE ${sp} OR p.detalle ILIKE ${sp})
            AND p.categoria IS NULL
            AND p.activo = true
        `;
      } else {
        rows = await sql`
          SELECT DISTINCT ON (p.codigo)
            p.id, p.codigo, p.detalle, p.imagen_url, p.categoria
          FROM public.productos p
          WHERE p.categoria IS NULL
            AND p.activo = true
          ORDER BY p.codigo ASC
          LIMIT ${limit} OFFSET ${offset}
        `;
        countRows = await sql`
          SELECT COUNT(DISTINCT p.codigo)::int as total
          FROM public.productos p
          WHERE p.categoria IS NULL
            AND p.activo = true
        `;
      }
    } else {
      if (hasSearch) {
        rows = await sql`
          SELECT DISTINCT ON (p.codigo)
            p.id, p.codigo, p.detalle, p.imagen_url, p.categoria
          FROM public.productos p
          WHERE (p.codigo ILIKE ${sp} OR p.detalle ILIKE ${sp})
            AND p.activo = true
          ORDER BY p.codigo ASC
          LIMIT ${limit} OFFSET ${offset}
        `;
        countRows = await sql`
          SELECT COUNT(DISTINCT p.codigo)::int as total
          FROM public.productos p
          WHERE (p.codigo ILIKE ${sp} OR p.detalle ILIKE ${sp})
            AND p.activo = true
        `;
      } else {
        rows = await sql`
          SELECT DISTINCT ON (p.codigo)
            p.id, p.codigo, p.detalle, p.imagen_url, p.categoria
          FROM public.productos p
          WHERE p.activo = true
          ORDER BY p.codigo ASC
          LIMIT ${limit} OFFSET ${offset}
        `;
        countRows = await sql`
          SELECT COUNT(DISTINCT p.codigo)::int as total
          FROM public.productos p
          WHERE p.activo = true
        `;
      }
    }

    const total = countRows[0].total;

    return NextResponse.json({
      productos: rows,
      total,
      hasMore: offset + rows.length < total,
    });
  } catch (error) {
    const message = mensajeError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
