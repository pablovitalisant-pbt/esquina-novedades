import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await getServerSession(authOptions);
  const rol = (session?.user as any)?.rol;
  if (!session || !['admin', 'bodeguero', 'vendedor'].includes(rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const rows = await sql`
      SELECT COUNT(*)::int AS count
      FROM productos p
      LEFT JOIN ubicaciones_bodega ub
        ON ub.codigo = p.codigo AND ub.empresa_id = p.empresa_id
      WHERE p.stock_minimo IS NOT NULL
        AND p.activo = true
        AND COALESCE(ub.saldo, p.saldo, 0) < p.stock_minimo
        AND p.no_reponer = false
        AND NOT EXISTS (
          SELECT 1 FROM alertas_stock_bajo a WHERE a.producto_id = p.id
        )
    `;
    return NextResponse.json({ count: rows[0]?.count ?? 0 });
  } catch (error: any) {
    console.error('GET /api/alertas-stock error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
