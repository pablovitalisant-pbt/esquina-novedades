import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Slice 3b — Aplicar saldo a favor de un cliente a una nota (acción manual).
// Nunca automático: un admin/vendedor elige aplicar saldo disponible a la
// deuda pendiente de una nota del MISMO cliente.
const AplicarSaldoSchema = z.object({
  monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
  observaciones: z.string().nullable().optional(),
});

function guard(session: any) {
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const rol = (session.user as any).rol;
  if (rol !== 'admin' && rol !== 'vendedor') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const g = guard(session);
  if (g) return g;

  const notaId = parseInt((await params).id, 10);
  if (isNaN(notaId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const parsed = AplicarSaldoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { monto, observaciones } = parsed.data;

    // 1. Nota existe y está activa.
    const notaRows = await sql`
      SELECT p.id, p.estado, p.cliente_id
      FROM public.prenotas p
      WHERE p.id = ${notaId}
    `;
    if (notaRows.length === 0) {
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
    }
    const nota = notaRows[0];
    if (nota.estado !== 'activa') {
      return NextResponse.json({ error: 'No se puede aplicar saldo a una nota anulada' }, { status: 422 });
    }

    // 2. El saldo a favor solo aplica a clientes con cuenta (UUID). Nota sin
    // cliente → no hay dueño del saldo, se rechaza (misma regla que 3a).
    if (nota.cliente_id == null) {
      return NextResponse.json(
        { error: 'Esta nota no tiene un cliente asociado, no puede aplicar saldo a favor' },
        { status: 422 }
      );
    }

    // 3. Saldo pendiente de la nota (total - pagado - débitos aplicados).
    const totalRows = await sql`
      SELECT COALESCE(SUM(pi.unidades * pi.precio), 0) AS total
      FROM public.prenota_items pi
      WHERE pi.prenota_id = ${notaId}
    `;
    const total = parseFloat(totalRows[0].total);

    const pagadoRows = await sql`
      SELECT COALESCE(SUM(CASE WHEN cm.tipo = 'reembolso' THEN -cmn.monto_aplicado ELSE cmn.monto_aplicado END), 0) AS total
      FROM caja_movimiento_notas cmn
      JOIN caja_movimientos cm ON cm.id = cmn.movimiento_id
      WHERE cmn.prenota_id = ${notaId}
    `;
    const totalPagado = parseFloat(pagadoRows[0].total);

    const sfRows = await sql`
      SELECT COALESCE(SUM(monto), 0) AS total
      FROM public.clientes_saldo_favor_movimientos
      WHERE aplicado_prenota_id = ${notaId} AND tipo = 'debito'
    `;
    const saldoFavorAplicado = parseFloat(sfRows[0].total);
    const saldoPendiente = total - totalPagado - saldoFavorAplicado;

    // 4. No aplicar más de lo que falta de la nota (el sobrante no vuelve).
    if (monto > saldoPendiente + 0.005) {
      return NextResponse.json(
        { error: `El monto excede el saldo pendiente de la nota ($${saldoPendiente.toFixed(2)})` },
        { status: 422 }
      );
    }

    const usuarioId = parseInt((session!.user as any).id, 10);
    const usuarioNombre = (session!.user as any).nombre as string;

    // 5. INSERT del débito, atómico con el saldo disponible del cliente.
    // El WHERE filtra el INSERT a 0 filas si el saldo disponible (créditos -
    // débitos acumulados) no alcanza el monto. Mitiga el caso más obvio de
    // doble aplicación concurrente; riesgo residual aceptado (ver PRD §10).
    const res = await sql`
      WITH saldo AS (
        SELECT COALESCE(SUM(CASE WHEN tipo='credito' THEN monto ELSE -monto END), 0) AS disponible
        FROM clientes_saldo_favor_movimientos
        WHERE cliente_id = ${nota.cliente_id}
      ),
      nuevo AS (
        INSERT INTO clientes_saldo_favor_movimientos
          (cliente_id, tipo, monto, aplicado_prenota_id, usuario_id, usuario_nombre, observaciones)
        SELECT ${nota.cliente_id}, 'debito', ${monto}, ${notaId},
          ${usuarioId}, ${usuarioNombre}, ${observaciones ?? null}
        FROM saldo
        WHERE saldo.disponible >= ${monto} - 0.005
        RETURNING id
      )
      SELECT COALESCE((SELECT disponible FROM saldo), 0) AS disponible,
             (SELECT id FROM nuevo) AS id
    `;
    const row = res[0];

    // INSERT de 0 filas → el cliente no tiene (o ya no tiene) saldo suficiente.
    if (row == null || row.id == null) {
      return NextResponse.json(
        { error: 'Saldo a favor insuficiente' },
        { status: 422 }
      );
    }

    const disponible = parseFloat(row.disponible);
    return NextResponse.json(
      {
        debito_aplicado: monto,
        saldo_pendiente_restante: saldoPendiente - monto,
        saldo_favor_restante: disponible - monto,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/notas-venta/[id]/aplicar-saldo-favor error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
