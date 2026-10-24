import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sql } from '@/lib/db';
import { authOptions } from '@/lib/auth';

import type { RouteContext } from '@/types';

type UsuarioSesion = { rol?: string };

function usuarioSesion(session: { user?: unknown } | null | undefined): UsuarioSesion {
  return (session?.user as UsuarioSesion | undefined) ?? {};
}

function codigoError(e: unknown): string {
  return e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : '';
}

function mensajeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function validarSesion() {
  const session = await getServerSession(authOptions);
  const rol = usuarioSesion(session).rol;

  if (!session) {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }

  if (rol === 'bodeguero') {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
  }

  return { session };
}

async function checkNotaActiva(notaId: number): Promise<NextResponse | null> {
  const notaRows = await sql`
    SELECT estado FROM public.prenotas WHERE id = ${notaId}
  `;
  if (notaRows.length === 0) {
    return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
  }
  if (notaRows[0].estado !== 'activa') {
    return NextResponse.json({ error: 'No se puede modificar una nota anulada' }, { status: 422 });
  }
  return null;
}

function calcularDelta(cantidadAnterior: number, cantidadNueva: number | undefined): number | null {
  if (cantidadNueva === undefined) return null; // sin cambio
  if (!Number.isFinite(cantidadNueva) || cantidadNueva <= 0) return NaN; // invalido
  return cantidadNueva - cantidadAnterior;
}

export async function PATCH(request: NextRequest, { params }: RouteContext<{ id: string; itemId: string }>) {
  const auth = await validarSesion();
  if (auth.error) return auth.error;

  const notaId = Number((await params).id);
  // itemId es ahora un UUID (string), ya no un SERIAL
  const itemId = (await params).itemId;

  const body = await request.json();
  let cantidadNueva = body?.unidades !== undefined ? Number(body.unidades) : undefined;
  const cajas = body?.cajas ?? null;
  const precio = body?.precio ?? null;

  // R4: Validar cantidad nueva ANTES de leer DB
  if (cantidadNueva !== undefined && (!Number.isFinite(cantidadNueva) || cantidadNueva <= 0)) {
    return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
  }

  // R7: Validar estado de la nota
  const notaError = await checkNotaActiva(notaId);
  if (notaError) return notaError;

  // Leer item actual para calcular delta y para conservar los campos que un
  // PATCH parcial no trae (BUG-053): cajas y precio entran en el fallback del UPDATE.
  const itemRows = await sql`
    SELECT unidades, cajas, precio, codigo, empresa_id, modalidad FROM public.prenota_items WHERE id = ${itemId}
  `;
  if (itemRows.length === 0) {
    return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 });
  }
  const item = itemRows[0];
  const cantidadAnterior = Number(item.unidades);

  // Modalidad inmutable; en caja las unidades las deriva el servidor con la
  // razon unidades/cajas congelada al vender (ignora body.unidades).
  const modalidad = item.modalidad ?? 'unidad';
  if (body?.modalidad !== undefined && body.modalidad !== modalidad) {
    return NextResponse.json({ error: 'La modalidad no se puede cambiar' }, { status: 400 });
  }
  if (modalidad === 'caja') {
    cantidadNueva = undefined;
    if (cajas !== null) {
      if (!Number.isInteger(cajas) || cajas < 1) {
        return NextResponse.json({ error: 'Cajas inválidas' }, { status: 400 });
      }
      if (!(Number(item.cajas) > 0)) {
        return NextResponse.json({ error: 'Item sin cajas registradas' }, { status: 422 });
      }
      cantidadNueva = Math.round(cajas * (cantidadAnterior / Number(item.cajas)));
    }
  }

  const delta = calcularDelta(cantidadAnterior, cantidadNueva);

  // R4: Validar cantidad nueva
  if (delta !== null && (isNaN(delta) || delta === Infinity || delta === -Infinity)) {
    return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
  }

  // Aplicar delta a stock
  if (delta !== null && delta !== 0) {
    if (delta > 0) {
      // Subiendo cantidad — verificar stock suficiente
      const updateRows = await sql`
        UPDATE public.productos SET saldo = saldo - ${delta}
        WHERE codigo = ${item.codigo} AND empresa_id = ${item.empresa_id}
          AND saldo >= ${delta}
        RETURNING saldo
      `;
      if (updateRows.length === 0) {
        const current = await sql`
          SELECT saldo FROM public.productos
          WHERE codigo = ${item.codigo} AND empresa_id = ${item.empresa_id}
        `;
        const disponible = current.length > 0 ? current[0].saldo : 0;
        return NextResponse.json({
          error: 'Stock insuficiente',
          disponible,
          solicitado: delta,
        }, { status: 400 });
      }
    } else {
      // Bajando cantidad — devolver stock, siempre permitido
      await sql`
        UPDATE public.productos SET saldo = saldo + ${-delta}
        WHERE codigo = ${item.codigo} AND empresa_id = ${item.empresa_id}
      `;
    }

    // R3: Propagar a ubicaciones_bodega
    await sql`
      UPDATE public.ubicaciones_bodega SET saldo = saldo + ${-delta}, updated_at = NOW()
      WHERE codigo = ${item.codigo} AND empresa_id = ${item.empresa_id}
    `;
  }

  // Actualizar el item (misma query template que el codigo original). Un PATCH
  // puede ser parcial (BUG-053): los campos que no vienen en el body conservan
  // el valor existente (item.cajas / item.unidades / item.precio), no se anulan.
  const rows = await sql`
    UPDATE public.prenota_items SET
      cajas = ${cajas !== null ? cajas : item.cajas},
      unidades = ${cantidadNueva !== undefined ? cantidadNueva : item.unidades},
      precio = ${precio !== null ? precio : item.precio}
    WHERE id = ${itemId}
    RETURNING *
  `;

  return NextResponse.json((rows as Record<string, unknown>[])[0] ?? null);
}

export async function DELETE(_request: NextRequest, { params }: RouteContext<{ id: string; itemId: string }>) {
  const auth = await validarSesion();
  if (auth.error) return auth.error;

  const notaId = Number((await params).id);
  // itemId es ahora un UUID (string), ya no un SERIAL
  const itemId = (await params).itemId;

  try {
    // R7 + R6 + bloqueo de fila en UNA transaccion atomica (punto 2):
    // 1) FOR UPDATE sobre prenotas serializa con anulacion/reembolso concurrentes
    //    (anti doble-restore).
    // 2) Guard 1/COUNT aborta (22012) si la nota no esta activa o el item no existe.
    // 3) El stock se restaura DESDE el item bajo el lock (subquery), no con un
    //    valor pre-leido afuera de la transaccion.
    await sql.transaction([
      sql`SELECT id FROM public.prenotas WHERE id = ${notaId} FOR UPDATE`,
      sql`SELECT 1 / (SELECT COUNT(*)::int FROM public.prenotas
            WHERE id = ${notaId} AND estado = 'activa'
            AND EXISTS (SELECT 1 FROM public.prenota_items WHERE id = ${itemId})) AS guard`,
      sql`UPDATE public.productos p SET saldo = p.saldo + it.unidades
          FROM (SELECT unidades, codigo, empresa_id FROM public.prenota_items WHERE id = ${itemId}) it
          WHERE p.codigo = it.codigo AND p.empresa_id = it.empresa_id`,
      sql`UPDATE public.ubicaciones_bodega u SET saldo = u.saldo + it.unidades, updated_at = NOW()
          FROM (SELECT unidades, codigo, empresa_id FROM public.prenota_items WHERE id = ${itemId}) it
          WHERE u.codigo = it.codigo AND u.empresa_id = it.empresa_id`,
      sql`DELETE FROM public.prenota_items WHERE id = ${itemId}`,
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    // El guard detecto una condicion invalida → distinguir la causa.
    if (codigoError(error) === '22012') {
      const notaRows = await sql`
        SELECT estado FROM public.prenotas WHERE id = ${notaId}
      `;
      if (notaRows.length === 0) {
        return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
      }
      if (notaRows[0].estado !== 'activa') {
        return NextResponse.json({ error: 'No se puede modificar una nota anulada' }, { status: 422 });
      }
      return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 });
    }
    console.error('DELETE item error:', error);
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}
