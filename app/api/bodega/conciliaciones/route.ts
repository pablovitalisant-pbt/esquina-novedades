import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sql } from '@/lib/db';
import type { UserSession } from '@/types';
import { authOptions } from '@/lib/auth';

/**
 * POST /api/bodega/conciliaciones — Conciliación de Stock.
 *
 * Admin-only: es una sobrescritura de productos.saldo (a diferencia de
 * /api/ingresos, que admite cualquier rol). Body:
 *   { codigo, fisico_cajas, fisico_unidades, observaciones? }
 *
 * fisicoTotal = fisico_cajas * cantcaja + fisico_unidades; el saldo del
 * producto pasa a ser exactamente ese conteo físico (NO saldo+delta, es una
 * corrección absoluta). Queda registrado en conciliaciones_stock (auditoría).
 *
 * Transacción atómica (sql.transaction):
 *   1. INSERT conciliaciones_stock (auditoría con diferencia).
 *   2. UPDATE productos SET saldo = fisicoTotal.
 *   3. UPDATE ubicaciones_bodega SET saldo=fisicoTotal, diferencia=0.
 *
 * Empresa se deriva de la sesión (single-tenant). El SELECT del producto se
 * hace antes de la transacción (mismo patrón que /api/ingresos) para validar
 * existencia y conocer saldo/cantcaja; los writes son atómicos.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const rol = (session.user as UserSession)?.rol;
  if (rol !== 'admin') {
    return NextResponse.json({ error: 'Solo el admin puede conciliar stock' }, { status: 403 });
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
  const fisicoCajas = body?.fisico_cajas;
  const fisicoUnidades = body?.fisico_unidades ?? 0;
  const observaciones = body?.observaciones?.trim() || null;

  if (!codigo) {
    return NextResponse.json({ error: 'codigo requerido' }, { status: 400 });
  }
  const cajas = Number(fisicoCajas);
  const unidades = Number(fisicoUnidades);
  if (!Number.isInteger(cajas) || cajas < 0) {
    return NextResponse.json({ error: 'fisico_cajas inválido' }, { status: 400 });
  }
  if (!Number.isInteger(unidades) || unidades < 0) {
    return NextResponse.json({ error: 'fisico_unidades inválido' }, { status: 400 });
  }

  const productoRows = await sql`
    SELECT codigo, empresa_id, cantcaja, saldo
    FROM public.productos
    WHERE codigo = ${codigo} AND empresa_id = ${empresaId}
  `;
  if (productoRows.length === 0) {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
  }
  const producto = productoRows[0];
  const cantcaja = Number(producto.cantcaja);
  const saldoAnterior = Number(producto.saldo);
  const fisicoTotal = cajas * cantcaja + unidades;
  const diferencia = fisicoTotal - saldoAnterior;

  const rows = await sql.transaction([
    sql`
      INSERT INTO public.conciliaciones_stock
        (empresa_id, codigo, saldo_anterior, saldo_nuevo, diferencia, cantcaja, fisico_cajas, fisico_unidades, observaciones, usuario_id, usuario_nombre)
      VALUES
        (${empresaId}, ${codigo}, ${saldoAnterior}, ${fisicoTotal}, ${diferencia}, ${cantcaja}, ${cajas}, ${unidades}, ${observaciones}, ${usuarioId}, ${usuarioNombre})
      RETURNING *
    `,
    sql`
      UPDATE public.productos
      SET saldo = ${fisicoTotal}
      WHERE codigo = ${codigo} AND empresa_id = ${empresaId}
    `,
    sql`
      UPDATE public.ubicaciones_bodega
      SET saldo = ${fisicoTotal}, fisico = ${fisicoTotal}, fisico_cajas = ${cajas}, fisico_unidades = ${unidades}, diferencia = 0, updated_at = NOW()
      WHERE codigo = ${codigo} AND empresa_id = ${empresaId}
    `,
  ]);

  void rows;

  return NextResponse.json({
    data: { codigo, saldo_anterior: saldoAnterior, saldo_nuevo: fisicoTotal, diferencia },
  }, { status: 200 });
}
