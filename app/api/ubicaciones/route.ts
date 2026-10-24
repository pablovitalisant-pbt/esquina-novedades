import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { mensajeError } from '@/lib/errores';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const empresaId = searchParams.get('empresa');
  const search = searchParams.get('search')?.toLowerCase() || '';
  const soloStock = searchParams.get('soloStock') === 'true';
  const soloNuevo = searchParams.get('soloNuevo') === 'true';

  if (!empresaId) return NextResponse.json({ error: "Falta empresa_id" }, { status: 400 });

  if (!session.user.empresas.includes(parseInt(empresaId, 10))) {
    return NextResponse.json({ error: "Empresa no autorizada" }, { status: 403 });
  }

  try {
    const eid = parseInt(empresaId, 10);
    const searchPattern = `%${search}%`;

    const rows = await sql`
      SELECT
        p.codigo,
        p.detalle,
        p.imagen_url as producto_imagen_url,
        p.empresa_id,
        p.saldo,
        p.cantcaja,
        p.umed,
        p.es_nuevo,
        u.id as ubicacion_id,
        u.ubicacion,
        u.fisico,
        u.fisico_cajas,
        u.fisico_unidades,
        u.diferencia,
        u.observaciones
      FROM productos p
      LEFT JOIN ubicaciones_bodega u ON u.codigo = p.codigo AND u.empresa_id = p.empresa_id
      WHERE p.empresa_id = ${eid}
        AND p.activo = true
        AND (${search} = '' OR LOWER(p.codigo) LIKE ${searchPattern} OR LOWER(p.detalle) LIKE ${searchPattern})
        AND (${soloStock} = false OR p.saldo > 0)
        AND (${soloNuevo} = false OR p.es_nuevo = true)
      ORDER BY p.codigo ASC
      LIMIT 100
    `;

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("GET /api/ubicaciones error:", error);
    const message = mensajeError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
