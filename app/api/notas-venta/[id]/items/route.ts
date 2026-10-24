import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sql } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { liberarReservasVencidas } from '@/lib/pedidos/liberar-reservas';

import type { RouteContext } from '@/types';
import { usuarioSesion } from '@/lib/session';

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  const rol = usuarioSesion(session).rol;

  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (rol === 'bodeguero') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'ID de nota inválido' }, { status: 400 });
  }
  const body = await request.json();
  const {
    id: itemId, // UUID opcional — lo manda BackendConnector en Slice 10b (id local de PowerSync)
    codigo,
    descripcion,
    imagen_url,
    empresa_id,
    cajas,
    precio,
    stock_referencia,
  } = body ?? {};
  let unidades = body?.unidades;
  const modalidad = body?.modalidad ?? 'unidad';
  if (modalidad !== 'unidad' && modalidad !== 'caja') {
    return NextResponse.json({ error: 'Modalidad inválida' }, { status: 400 });
  }

  // Idempotencia: si este item ya fue insertado (reintento de PowerSync tras
  // una respuesta que no llegó limpia al cliente), devolver la fila existente
  // sin repetir el descuento de stock. Sin esto, cada reintento de un item ya
  // aplicado vuelve a descontar stock antes de chocar con la unique constraint
  // del INSERT — causó pérdida real de stock en producción (ver BUGS.md).
  if (itemId) {
    const existente = await sql`
      SELECT * FROM public.prenota_items WHERE id = ${itemId}
    `;
    if (existente.length > 0) {
      return NextResponse.json(existente[0]);
    }
  }

  // R7: Validar que la nota este activa
  const notaRows = await sql`
    SELECT estado FROM public.prenotas WHERE id = ${id}
  `;
  if (notaRows.length === 0) {
    return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
  }
  if (notaRows[0].estado !== 'activa') {
    return NextResponse.json({ error: 'No se puede modificar una nota anulada' }, { status: 422 });
  }

  // Caja: el servidor deriva unidades = cajas * cantcaja (ignora el body)
  if (modalidad === 'caja') {
    if (!Number.isInteger(cajas) || cajas < 1) {
      return NextResponse.json({ error: 'Cajas inválidas' }, { status: 400 });
    }
    const prod = await sql`
      SELECT cantcaja, precio_mayor FROM public.productos
      WHERE codigo = ${codigo} AND empresa_id = ${empresa_id}
    `;
    const cantcaja = Number(prod[0]?.cantcaja);
    if (prod.length === 0 || !(Number(prod[0].precio_mayor) > 0) || !Number.isInteger(cantcaja) || cantcaja < 1) {
      return NextResponse.json({ error: 'Producto sin precio por caja' }, { status: 400 });
    }
    unidades = cajas * cantcaja;
  }

  // R4: Validar unidades
  const cantidadTotal = Number(unidades);
  if (!Number.isFinite(cantidadTotal) || cantidadTotal <= 0) {
    return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
  }

  // Slice 8c: liberar reservas vencidas antes de competir por el stock.
  // En escritura el error se propaga (contrato §8): no reservar sobre stock sucio.
  await liberarReservasVencidas();

  // R1/R6: Descontar stock atómicamente — UPDATE con WHERE saldo >= cantidad
  const updateRows = await sql`
    UPDATE public.productos SET saldo = saldo - ${cantidadTotal}
    WHERE codigo = ${codigo} AND empresa_id = ${empresa_id}
      AND saldo >= ${cantidadTotal}
    RETURNING saldo
  `;

  if (updateRows.length === 0) {
    // Stock insuficiente — leer saldo actual para informar
    const current = await sql`
      SELECT saldo FROM public.productos
      WHERE codigo = ${codigo} AND empresa_id = ${empresa_id}
    `;
    const disponible = current.length > 0 ? current[0].saldo : 0;
    return NextResponse.json({
      error: 'Stock insuficiente',
      disponible,
      solicitado: cantidadTotal,
    }, { status: 400 });
  }

  // R3: Propagar a ubicaciones_bodega si existe fila
  await sql`
    UPDATE public.ubicaciones_bodega SET saldo = saldo - ${cantidadTotal}, updated_at = NOW()
    WHERE codigo = ${codigo} AND empresa_id = ${empresa_id}
  `;

  const rows = await sql`
    INSERT INTO public.prenota_items (id, prenota_id, codigo, descripcion, imagen_url, empresa_id, cajas, unidades, precio, stock_referencia, modalidad)
    VALUES (COALESCE(${itemId ?? null}, gen_random_uuid()), ${id}, ${codigo}, ${descripcion}, ${imagen_url}, ${empresa_id}, ${cajas}, ${unidades}, ${precio}, ${stock_referencia}, ${modalidad})
    RETURNING *
  `;

  await sql`
    UPDATE public.prenotas SET updated_at = now() WHERE id = ${id}
  `;

  return NextResponse.json((rows as Record<string, unknown>[])[0]);
}
