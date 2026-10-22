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
      SELECT
        p.id AS producto_id,
        p.codigo,
        p.detalle,
        p.imagen_url,
        COALESCE(ub.saldo, p.saldo, 0) AS saldo,
        p.stock_minimo,
        p.cantcaja,
        (p.stock_minimo - COALESCE(ub.saldo, p.saldo, 0)) AS deficit
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
      ORDER BY deficit DESC
    `;
    return NextResponse.json({ data: rows });
  } catch (error: any) {
    console.error('GET /api/alertas-stock/lista error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
