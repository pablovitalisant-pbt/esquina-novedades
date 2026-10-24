import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sql } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import type { UserSession } from '@/types';

/**
 * POST /api/ingresos — Ingreso de Mercadería.
 *
 * Cualquier rol autenticado (admin, bodeguero, vendedor). Body:
 *   { codigo: string, cantidad: number, cantcaja_nuevo?: number, observaciones?: string }
 *
 * empresa_id se deriva de la sesión (session.user.empresas[0]) porque la
 * empresa es única (single-tenant) — el body no lo trae por contrato.
 *
 * Transacción atómica (sql.transaction):
 *   1. INSERT en ingresos_mercaderia (auditoría + packing registrado).
 *   2. UPDATE productos SET saldo = saldo + $cantidad — incremento atómico en
 *      SQL, NO lectura-y-escritura, para que dos ingresos simultáneos no se
 *      pisen. Si cambió el packing, además cantcaja = $nuevo.
 *   3. UPDATE ubicaciones_bodega SET saldo = saldo + $cantidad (mismo patrón
 *      que notas-venta para mantener las dos tablas sincronizadas).
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const user = session.user as UserSession;
  const usuarioId = Number(user.id);
  const usuarioNombre = user.nombre;
  const empresaId = Number(user.empresas?.[0]);

  if (!empresaId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 400 });
  }

  const body = await request.json();
  const codigo = body?.codigo?.trim();
  const cantidad = Number(body?.cantidad);
  const cantcajaNuevo = body?.cantcaja_nuevo !== undefined ? Number(body?.cantcaja_nuevo) : undefined;
  const observaciones = body?.observaciones?.trim() || null;

  if (!codigo) {
    return NextResponse.json({ error: 'codigo requerido' }, { status: 400 });
  }
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
  }
  if (cantcajaNuevo !== undefined && (!Number.isInteger(cantcajaNuevo) || cantcajaNuevo <= 0)) {
    return NextResponse.json({ error: 'cantcaja_nuevo inválido' }, { status: 400 });
  }

  // Leer el producto para verificar existencia y conocer su packing actual.
  const productoRows = await sql`
    SELECT codigo, empresa_id, cantcaja, saldo
    FROM public.productos
    WHERE codigo = ${codigo} AND empresa_id = ${empresaId}
  `;
  if (productoRows.length === 0) {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
  }
  const producto = productoRows[0];

  // Determinar packing registrado y si cambió en esta partida.
  const cambioPacking = cantcajaNuevo !== undefined && cantcajaNuevo !== Number(producto.cantcaja);
  const cantcajaRegistrado = cambioPacking ? cantcajaNuevo : Number(producto.cantcaja);

  const rows = await sql.transaction([
    sql`
      INSERT INTO public.ingresos_mercaderia
        (empresa_id, codigo, cantidad, cantcaja_registrado, cantcaja_cambio, observaciones, usuario_id, usuario_nombre)
      VALUES
        (${empresaId}, ${codigo}, ${cantidad}, ${cantcajaRegistrado}, ${cambioPacking}, ${observaciones}, ${usuarioId}, ${usuarioNombre})
      RETURNING *
    `,
    sql`
      UPDATE public.productos
      SET saldo = saldo + ${cantidad},
          cantcaja = CASE WHEN ${cambioPacking} THEN ${cantcajaRegistrado} ELSE cantcaja END
      WHERE codigo = ${codigo} AND empresa_id = ${empresaId}
    `,
    sql`
      UPDATE public.ubicaciones_bodega
      SET saldo = saldo + ${cantidad}, updated_at = NOW()
      WHERE codigo = ${codigo} AND empresa_id = ${empresaId}
    `,
  ]);

  return NextResponse.json(rows[0][0] ?? { ok: true }, { status: 200 });
}
